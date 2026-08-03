/**
 * Harness storage abstraction (RFC 0002 §21): an adapter interface — not a
 * data layer. The in-memory reference adapter backs tests and local dev; a
 * SQL adapter plugs in for production (threads/messages/snapshots tables).
 */

export interface ThreadRecord {
  id: string;
  resourceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: unknown;
  createdAt: number;
}

export interface ScheduleSeed {
  name: string;
  cron: string;
  /** Clock seed for a schedule the store has not seen yet (or whose cron changed). */
  nextRun: number;
}

export interface ScheduleRecord extends ScheduleSeed {
  /** Opaque handler memory, persisted across claims (e.g. a durable run id). */
  state?: unknown;
  /**
   * Fencing token for this claim. A run that outlives its lease has already
   * been taken over, so its late writes must not land — passing this back
   * makes them no-ops instead of a rewind of the new holder's clock.
   */
  lease?: number;
  lastRun?: number;
  lastStatus?: 'ok' | 'error';
  lastError?: string;
}

export interface ScheduleOutcome {
  nextRun: number;
  lastRun: number;
  lastStatus: 'ok' | 'error';
  lastError?: string;
}

/**
 * At-least-once scheduling state (RFC 0002 §20). A claim is an atomic lease:
 * concurrent workers never claim the same due schedule, and a lease that
 * outlives its holder reopens — so a crash mid-run means a re-run, never a
 * lost run.
 */
export interface ScheduleStore {
  /** Reconciles the store with the schedules on disk: seeds new ones, prunes removed ones. */
  syncSchedules(seeds: ScheduleSeed[]): Promise<void>;
  claimDueSchedules(now: number, leaseMs: number): Promise<ScheduleRecord[]>;
  /** `lease` fences the write: omit it only where no claim is being closed. */
  settleSchedule(name: string, outcome: ScheduleOutcome, lease?: number): Promise<void>;
  saveScheduleState(name: string, state: unknown, lease?: number): Promise<void>;
}

export interface HarnessStorage {
  getThread(id: string): Promise<ThreadRecord | undefined>;
  listThreads(resourceId: string): Promise<ThreadRecord[]>;
  saveThread(thread: ThreadRecord): Promise<void>;
  deleteThread(id: string): Promise<void>;
  appendMessage(message: MessageRecord): Promise<void>;
  listMessages(threadId: string, limit?: number): Promise<MessageRecord[]>;
  /** Durable workflow snapshots, keyed by run id. */
  saveSnapshot(runId: string, snapshot: unknown): Promise<void>;
  loadSnapshot(runId: string): Promise<unknown | undefined>;
  deleteSnapshot(runId: string): Promise<void>;
}

export function createMemoryStorage(): HarnessStorage & ScheduleStore {
  const threads = new Map<string, ThreadRecord>();
  const messages = new Map<string, MessageRecord[]>();
  const snapshots = new Map<string, unknown>();
  const schedules = new Map<string, ScheduleRecord>();
  /** The record, unless the caller is writing on a lease someone else has taken over. */
  const held = (name: string, lease?: number) => {
    const record = schedules.get(name);

    return lease === undefined || record?.lease === lease ? record : undefined;
  };

  return {
    async getThread(id) {
      return threads.get(id);
    },
    async listThreads(resourceId) {
      return [...threads.values()]
        .filter((thread) => thread.resourceId === resourceId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async saveThread(thread) {
      threads.set(thread.id, thread);
    },
    async deleteThread(id) {
      threads.delete(id);
      messages.delete(id);
    },
    async appendMessage(message) {
      const list = messages.get(message.threadId) ?? [];

      list.push(message);
      messages.set(message.threadId, list);
    },
    async listMessages(threadId, limit) {
      const list = messages.get(threadId) ?? [];

      return limit ? list.slice(-limit) : [...list];
    },
    async saveSnapshot(runId, snapshot) {
      snapshots.set(runId, snapshot);
    },
    async loadSnapshot(runId) {
      return snapshots.get(runId);
    },
    async deleteSnapshot(runId) {
      snapshots.delete(runId);
    },
    async syncSchedules(seeds) {
      const known = new Set(seeds.map((seed) => seed.name));

      for (const name of [...schedules.keys()].filter((name) => !known.has(name))) schedules.delete(name);
      for (const seed of seeds.filter((seed) => schedules.get(seed.name)?.cron !== seed.cron)) {
        // Reseeding the clock is not forgetting the schedule: a changed cron
        // keeps the handler's memory, exactly as the SQL adapter does.
        const existing = schedules.get(seed.name);

        schedules.set(seed.name, existing ? Object.assign(existing, seed, { lease: undefined }) : { ...seed });
      }
    },
    async claimDueSchedules(now, leaseMs) {
      const due = [...schedules.values()].filter((record) => record.nextRun <= now && (record.lease ?? 0) <= now);

      for (const record of due) record.lease = now + leaseMs;

      return due.map((record) => ({ ...record }));
    },
    async settleSchedule(name, outcome, lease) {
      const record = held(name, lease);

      if (record) Object.assign(record, { ...outcome, lastError: outcome.lastError, lease: undefined });
    },
    async saveScheduleState(name, state, lease) {
      const record = held(name, lease);

      if (record) record.state = state;
    },
  };
}
