import { describe, expect, it } from 'bun:test';
import { createScheduler, defineSchedule, type ScheduleContext } from './schedule';
import { createMemoryStorage } from './storage';

// 09:00:30 local — deliberately off the minute boundary.
const T0 = new Date(2026, 2, 10, 9, 0, 30).getTime();
const MINUTE = 60_000;

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(check()).toBe(true);
}

describe('defineSchedule', () => {
  it('validates the cron expression eagerly, at definition time', () => {
    expect(() => defineSchedule({ cron: '99 99 * * *', run: () => {} })).toThrow('invalid_cron:99 99 * * *');
    expect(defineSchedule({ cron: '@daily', run: () => {} }).cron).toBe('@daily');
  });
});

describe('createScheduler', () => {
  it('seeds new schedules from now and runs them when due, advancing the clock', async () => {
    const dueAts: number[] = [];
    const storage = createMemoryStorage();
    let now = T0;
    const scheduler = createScheduler({
      storage,
      now: () => now,
      schedules: {
        sweep: defineSchedule({
          cron: '* * * * *',
          run: ({ dueAt }) => {
            dueAts.push(dueAt.getTime());
          },
        }),
      },
    });

    // Seeded at the next occurrence (09:01), never the epoch: nothing due yet.
    expect(await scheduler.tick()).toEqual([]);
    now = T0 + MINUTE;
    expect(await scheduler.tick()).toEqual(['sweep']);
    expect(dueAts).toEqual([new Date(2026, 2, 10, 9, 1).getTime()]);
    // Already advanced to 09:02 — the same occurrence never runs twice.
    expect(await scheduler.tick()).toEqual([]);
  });

  it('never double-runs an occurrence across two workers on the same store', async () => {
    const runs: string[] = [];
    const storage = createMemoryStorage();
    let now = T0;
    const worker = (id: string) =>
      createScheduler({
        storage,
        now: () => now,
        schedules: {
          sweep: defineSchedule({
            cron: '* * * * *',
            run: () => {
              runs.push(id);
            },
          }),
        },
      });
    const [a, b] = [worker('a'), worker('b')];

    await a.tick();
    now = T0 + MINUTE;
    await Promise.all([a.tick(), b.tick()]);

    expect(runs).toHaveLength(1);
  });

  it('records a failing run and still advances the clock', async () => {
    const storage = createMemoryStorage();
    let now = T0;
    const scheduler = createScheduler({
      storage,
      now: () => now,
      schedules: {
        boom: defineSchedule({
          cron: '* * * * *',
          run: () => {
            throw new Error('kaput');
          },
        }),
      },
    });

    await scheduler.tick();
    now = T0 + MINUTE;
    expect(await scheduler.tick()).toEqual(['boom']);
    const [record] = await storage.claimDueSchedules(now + MINUTE, 1_000);

    expect(record).toMatchObject({ name: 'boom', lastRun: now, lastStatus: 'error', lastError: 'kaput' });
  });

  it('hands each run the state the previous one remembered', async () => {
    const seen: unknown[] = [];
    const storage = createMemoryStorage();
    let now = T0;
    const scheduler = createScheduler({
      storage,
      now: () => now,
      schedules: {
        sweep: defineSchedule({
          cron: '* * * * *',
          async run({ state, remember }: ScheduleContext) {
            seen.push(state);
            await remember({ count: ((state as { count?: number } | undefined)?.count ?? 0) + 1 });
          },
        }),
      },
    });

    await scheduler.tick();
    now += MINUTE;
    await scheduler.tick();
    now += MINUTE;
    await scheduler.tick();

    expect(seen).toEqual([undefined, { count: 1 }]);
  });

  it('lets the lease dedupe a tick that overlaps a slow run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const storage = createMemoryStorage();
    let now = T0;
    const scheduler = createScheduler({
      storage,
      now: () => now,
      schedules: { slow: defineSchedule({ cron: '* * * * *', run: () => gate }) },
    });

    await scheduler.tick();
    now = T0 + MINUTE;
    const inFlight = scheduler.tick();

    expect(await scheduler.tick()).toEqual([]);
    release();
    expect(await inFlight).toEqual(['slow']);
  });

  it('start() ticks on an interval until stop()', async () => {
    const storage = createMemoryStorage();
    let runs = 0;

    // A pending occurrence from a previous life: sync must keep it, not reseed.
    await storage.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: 0 }]);
    const scheduler = createScheduler({
      storage,
      tickMs: 5,
      schedules: {
        sweep: defineSchedule({
          cron: '* * * * *',
          run: () => {
            runs += 1;
          },
        }),
      },
    });

    scheduler.start();
    await until(() => runs === 1);
    scheduler.stop();
    expect(runs).toBe(1);
  });
});
