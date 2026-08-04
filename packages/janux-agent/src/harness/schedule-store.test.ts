import { afterAll, describe, expect, it } from 'bun:test';
import { createMemoryStorage, type ScheduleStore } from './storage';
import { createPgStorage } from './pg-storage';

const PG_URL = process.env.JANUX_TEST_PG ?? 'postgres://assistant:assistant@localhost:5432/janux_harness_test';
// Probed where the connection actually points: a hardcoded 5432 skips the whole
// suite in silence whenever JANUX_TEST_PG names another port.
const { hostname, port } = new URL(PG_URL);
// Bun reports a refused connection as ConnectionRefused/"Unable to connect" (no ECONNREFUSED).
const reachable = await fetch(`http://${hostname}:${port || 5432}`).catch((error) =>
  /ECONNREFUSED|ConnectionRefused|Unable to connect/i.test(`${error?.code ?? ''} ${error.cause ?? error}`) ? undefined : 'up',
);
const pgSuite = reachable === undefined ? describe.skip : describe;
const pgStorage = reachable === undefined ? undefined : await createPgStorage({ connectionString: PG_URL });

afterAll(async () => {
  await pgStorage?.close();
});

function scheduleStoreContract(makeStore: () => Promise<ScheduleStore> | ScheduleStore) {
  const T0 = 1_700_000_000_000;
  const LEASE = 30_000;

  it('seeds new schedules and keeps the clock of unchanged ones', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '0 * * * *', nextRun: T0 }]);
    // Re-sync with the same cron: the pending nextRun survives (no reseed on boot).
    await store.syncSchedules([{ name: 'sweep', cron: '0 * * * *', nextRun: T0 + 999 }]);
    const [claimed] = await store.claimDueSchedules(T0, LEASE);

    expect(claimed?.name).toBe('sweep');
    expect(claimed?.nextRun).toBe(T0);
  });

  it('reseeds the clock when the cron expression changes', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '0 * * * *', nextRun: T0 }]);
    await store.syncSchedules([{ name: 'sweep', cron: '30 * * * *', nextRun: T0 + 60_000 }]);

    expect(await store.claimDueSchedules(T0, LEASE)).toEqual([]);
    expect((await store.claimDueSchedules(T0 + 60_000, LEASE))[0]?.cron).toBe('30 * * * *');
  });

  it('prunes schedules that no longer exist on disk', async () => {
    const store = await makeStore();

    await store.syncSchedules([
      { name: 'keep', cron: '* * * * *', nextRun: T0 },
      { name: 'drop', cron: '* * * * *', nextRun: T0 },
    ]);
    await store.syncSchedules([{ name: 'keep', cron: '* * * * *', nextRun: T0 }]);
    const claimed = await store.claimDueSchedules(T0, LEASE);

    expect(claimed.map((record) => record.name)).toEqual(['keep']);
  });

  it('claims a due schedule exactly once until the lease expires', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: T0 }]);

    expect((await store.claimDueSchedules(T0, LEASE)).map((r) => r.name)).toEqual(['sweep']);
    // Same instant, second worker: the lease dedupes.
    expect(await store.claimDueSchedules(T0, LEASE)).toEqual([]);
    // Not due yet, nothing to claim.
    expect(await store.claimDueSchedules(T0 - 1, LEASE)).toEqual([]);
    // The holder died: past the lease the claim reopens (at-least-once).
    expect((await store.claimDueSchedules(T0 + LEASE, LEASE)).map((r) => r.name)).toEqual(['sweep']);
  });

  it('settling releases the lease, advances the clock and records the outcome', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: T0 }]);
    await store.claimDueSchedules(T0, LEASE);
    await store.settleSchedule('sweep', { nextRun: T0 + 60_000, lastRun: T0, lastStatus: 'error', lastError: 'boom' });

    expect(await store.claimDueSchedules(T0 + 30_000, LEASE)).toEqual([]);
    const [reclaimed] = await store.claimDueSchedules(T0 + 60_000, LEASE);

    expect(reclaimed).toMatchObject({ name: 'sweep', lastRun: T0, lastStatus: 'error', lastError: 'boom' });
  });

  it('remembers handler state across claims', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: T0 }]);
    const [claim] = await store.claimDueSchedules(T0, LEASE);

    await store.saveScheduleState('sweep', { runId: 'run_x_1' }, claim!.lease);

    expect((await store.claimDueSchedules(T0 + LEASE, LEASE))[0]?.state).toEqual({ runId: 'run_x_1' });
  });

  /**
   * A run that outlives its lease has already been taken over. Letting its
   * late settle through would clear the new holder's lease and rewind the
   * clock to the loser's idea of it — two workers on one schedule, which is
   * the exact thing the lease exists to prevent.
   */
  it('ignores a settle and a remember from a lease that has been taken over', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: T0 }]);
    const [slow] = await store.claimDueSchedules(T0, LEASE);
    const [taker] = await store.claimDueSchedules(T0 + LEASE, LEASE);

    expect(taker?.lease).not.toBe(slow!.lease);
    await store.saveScheduleState('sweep', { from: 'slow' }, slow!.lease);
    await store.settleSchedule('sweep', { nextRun: T0, lastRun: T0, lastStatus: 'ok' }, slow!.lease);

    // The taker still holds it, and the stale memory never landed.
    expect(await store.claimDueSchedules(T0 + LEASE + 1, LEASE)).toEqual([]);
    await store.settleSchedule('sweep', { nextRun: T0 + 5 * LEASE, lastRun: T0, lastStatus: 'ok' }, taker!.lease);
    const [after] = await store.claimDueSchedules(T0 + 5 * LEASE, LEASE);

    expect(after?.state).toBeUndefined();
  });

  it('lets a claim settle without knowing its lease, for callers that have none', async () => {
    const store = await makeStore();

    await store.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: T0 }]);
    await store.claimDueSchedules(T0, LEASE);
    await store.settleSchedule('sweep', { nextRun: T0 + 60_000, lastRun: T0, lastStatus: 'ok' });

    expect((await store.claimDueSchedules(T0 + 60_000, LEASE))[0]?.name).toBe('sweep');
  });
}

describe('schedule store (memory)', () => {
  scheduleStoreContract(() => createMemoryStorage());
});

pgSuite('schedule store (real Postgres)', () => {
  scheduleStoreContract(async () => {
    // The sync prunes unknown names, so starting each test from an empty table
    // is the same call the scheduler makes on boot.
    await pgStorage!.syncSchedules([]);

    return pgStorage!;
  });

  it('two concurrent workers never claim the same due schedule', async () => {
    await pgStorage!.syncSchedules([{ name: 'sweep', cron: '* * * * *', nextRun: 1 }]);
    const [first, second] = await Promise.all([
      pgStorage!.claimDueSchedules(Date.now(), 30_000),
      pgStorage!.claimDueSchedules(Date.now(), 30_000),
    ]);

    expect(first.length + second.length).toBe(1);
  });
});
