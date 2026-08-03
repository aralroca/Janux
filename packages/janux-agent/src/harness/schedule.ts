import { reportError } from 'janux/observability';
import { isValidCron, nextOccurrence } from './cron';
import type { ScheduleRecord, ScheduleStore } from './storage';

/**
 * Scheduled jobs (RFC 0002 §20): the trigger for durable workflows. Execution
 * is at-least-once — a claim is a store lease, so a crash mid-run reopens the
 * occurrence instead of losing it — and deduplicated: the lease keeps
 * concurrent workers off the same occurrence, and `remember()` gives handlers
 * durable memory (e.g. a run id) so a re-run resumes instead of restarting.
 */

export interface ScheduleContext {
  name: string;
  /** The instant this occurrence was due — not when it actually ran. */
  dueAt: Date;
  /** Whatever the previous run remembered (undefined on the first run). */
  state: unknown;
  /** Persists handler memory immediately; it survives crashes and restarts. */
  remember(state: unknown): Promise<void>;
}

export interface ScheduleDef {
  /** Five-field cron expression or @-alias, interpreted in local time. */
  cron: string;
  run(context: ScheduleContext): Promise<void> | void;
}

export interface SchedulerOptions {
  storage: ScheduleStore;
  /** Discovered definitions, keyed by schedule name. */
  schedules: Record<string, ScheduleDef>;
  /** In-process trigger interval (default 30s). */
  tickMs?: number;
  /** How long a claim stays exclusive before a crashed worker's run reopens (default 60s). */
  leaseMs?: number;
  now?: () => number;
}

export function defineSchedule(def: ScheduleDef): ScheduleDef {
  if (!isValidCron(def.cron)) throw new Error(`invalid_cron:${def.cron}`);

  return def;
}

/** `src/schedules/_config.ts`: which store backs the scheduler (in-memory unless it says otherwise). */
export interface ScheduleConfig {
  storage?: ScheduleStore;
  tickMs?: number;
  leaseMs?: number;
}

export function defineScheduleConfig(config: ScheduleConfig): ScheduleConfig {
  return config;
}

export function createScheduler(options: SchedulerOptions) {
  const { storage, schedules, tickMs = 30_000, leaseMs = 60_000, now = Date.now } = options;
  const invalid = Object.values(schedules).find((def) => !isValidCron(def.cron));

  // At boot, not at the first tick: a bad expression must stop the deployment.
  if (invalid) throw new Error(`invalid_cron:${invalid.cron}`);
  let timer: ReturnType<typeof setInterval> | undefined;
  let synced: Promise<void> | undefined;

  const seeds = () =>
    Object.entries(schedules).map(([name, def]) => ({
      name,
      cron: def.cron,
      // Seeded from now, never from the epoch — a brand-new schedule waits for
      // its first occurrence instead of firing immediately on first sight.
      nextRun: nextOccurrence(def.cron, new Date(now())).getTime(),
    }));
  const sync = () =>
    (synced ??= storage.syncSchedules(seeds()).catch((error) => {
      synced = undefined;
      throw error;
    }));

  function contextFor(record: ScheduleRecord): ScheduleContext {
    return {
      name: record.name,
      dueAt: new Date(record.nextRun),
      state: record.state,
      remember: (state) => storage.saveScheduleState(record.name, state, record.lease),
    };
  }

  async function execute(record: ScheduleRecord): Promise<Error | undefined> {
    try {
      const def = schedules[record.name];

      if (!def) throw new Error(`unknown_schedule:${record.name}`);
      await def.run(contextFor(record));

      return undefined;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  async function settle(record: ScheduleRecord, startedAt: number): Promise<string> {
    const failure = await execute(record);

    if (failure) reportError(failure, { phase: 'invocation', intent: `schedule:${record.name}` });
    await storage.settleSchedule(
      record.name,
      {
        // From the finish, not the start: a run longer than the interval must
        // not settle onto an already-past occurrence and re-fire immediately.
        nextRun: nextOccurrence(record.cron, new Date(now())).getTime(),
        lastRun: startedAt,
        lastStatus: failure ? 'error' : 'ok',
        lastError: failure?.message,
      },
      record.lease,
    );

    return record.name;
  }

  async function tick(): Promise<string[]> {
    await sync();
    const claimed = await storage.claimDueSchedules(now(), leaseMs);

    return Promise.all(claimed.map((record) => settle(record, now())));
  }

  function start(): void {
    const heartbeat = () => {
      tick().catch((error) => reportError(error, { phase: 'invocation', intent: 'schedule:tick' }));
    };

    heartbeat();
    timer = setInterval(heartbeat, tickMs);
    (timer as { unref?(): void }).unref?.();
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  return { tick, start, stop };
}

export type Scheduler = ReturnType<typeof createScheduler>;
