import { describe, expect, it } from 'bun:test';
import {
  createMemoryStorage,
  createScheduler,
  createStep,
  createWorkflow,
  createWorkflowRunner,
  defineSchedule,
  defineScheduleConfig,
  isValidCron,
  nextOccurrence,
} from '@janux/agent';

/**
 * reference/agent-schedules.md. The page's load-bearing claims are the ones a
 * reader would otherwise have to take on faith: that a schedule triggers a
 * durable run, that `remember()` makes a re-run resume rather than restart,
 * and that the lease keeps two instances off the same occurrence.
 */

const provisioning = createWorkflow<{ plan?: string }>({
  id: 'provisioning',
  initialState: () => ({}),
  steps: [
    createStep({
      id: 'collect-plan',
      run: ({ state, resumeData, suspend }: any) => {
        if (!resumeData) return suspend({ question: 'Which plan?' });
        state.plan = resumeData;
      },
    }),
  ],
});

const AT = new Date(2026, 2, 10, 9, 0).getTime();
const MINUTE = 60_000;

describe('reference/agent-schedules.md', () => {
  it('validates cron at definition time, so a typo cannot become a job that never runs', () => {
    expect(() => defineSchedule({ cron: 'every friday', run: () => {} })).toThrow('invalid_cron');
    expect(isValidCron('*/15 * * * *')).toBe(true);
    expect(isValidCron('0 9 * * MON-FRI')).toBe(true);
    // The page's list of accepted forms, checked against the parser itself.
    ['@hourly', '@daily', '@midnight', '@weekly', '@monthly', '@yearly'].forEach((alias) =>
      expect(isValidCron(alias)).toBe(true),
    );
    expect(nextOccurrence('0 3 * * *', new Date(2026, 2, 10, 4, 0))).toEqual(new Date(2026, 2, 11, 3, 0));
    // Valid means "will fire": the 30th of February parses and never happens.
    expect(isValidCron('0 0 30 2 *')).toBe(false);
    expect(() => defineSchedule({ cron: '0 0 30 2 *', run: () => {} })).toThrow('invalid_cron');
  });

  it('the sweep example starts a durable run, then resumes that same run next time', async () => {
    const storage = createMemoryStorage();
    const runner = createWorkflowRunner(storage);
    const seen: unknown[] = [];
    let opened = '';
    let now = AT;
    // The page's example, verbatim in shape: start once, remember the run id,
    // resume it on the following occurrence.
    const scheduler = createScheduler({
      storage,
      now: () => now,
      schedules: {
        'provision-sweep': defineSchedule({
          cron: '*/5 * * * *',
          async run({ state, remember }) {
            const pending = (state as { runId?: string } | undefined)?.runId;

            seen.push(state);
            if (pending) {
              const finished = await runner.resume(provisioning, pending, 'starter');

              await remember({ completed: finished.runId });

              return;
            }
            const started = await runner.start(provisioning, {});

            opened = started.runId;
            await remember({ runId: started.runId });
          },
        }),
      },
    });

    await scheduler.tick();
    now += 5 * MINUTE;
    expect(await scheduler.tick()).toEqual(['provision-sweep']);
    expect(opened).toContain('provisioning');
    // The suspended run is in storage, waiting — exactly what a restart finds.
    expect(await storage.loadSnapshot(opened)).toMatchObject({ status: 'suspended' });

    now += 5 * MINUTE;
    expect(await scheduler.tick()).toEqual(['provision-sweep']);

    // The second occurrence was handed what the first remembered, so it resumed
    // that run instead of opening another — and completing consumed the snapshot.
    expect(seen).toEqual([undefined, { runId: opened }]);
    expect(await storage.loadSnapshot(opened)).toBeUndefined();
  });

  it('the lease keeps two instances off the same occurrence, and reopens when one dies', async () => {
    const storage = createMemoryStorage();
    const ran: string[] = [];
    const instance = (id: string) =>
      createScheduler({
        storage,
        leaseMs: 30_000,
        now: () => AT,
        schedules: {
          sweep: defineSchedule({
            cron: '* * * * *',
            run: () => {
              ran.push(id);
            },
          }),
        },
      });

    await storage.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: AT }]);
    await Promise.all([instance('a').tick(), instance('b').tick()]);
    expect(ran).toHaveLength(1);

    // A worker that claims and then dies never settles, so its lease is all that
    // stands between the occurrence and a second attempt.
    const died = AT + MINUTE;

    expect(await storage.claimDueSchedules(died, 30_000)).toHaveLength(1);
    expect(await storage.claimDueSchedules(died + 1_000, 30_000)).toEqual([]);
    expect(await storage.claimDueSchedules(died + 30_000, 30_000)).toHaveLength(1);
  });

  it('_config.ts is a plain object: the store, and the two timings around it', () => {
    const storage = createMemoryStorage();
    const config = defineScheduleConfig({ storage, tickMs: 30_000, leaseMs: 60_000 });

    expect(config).toEqual({ storage, tickMs: 30_000, leaseMs: 60_000 });
  });
});
