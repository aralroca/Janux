import { afterAll, describe, expect, it } from 'bun:test';
import { createPgStorage } from './pg-storage';

const PG_URL = process.env.JANUX_TEST_PG ?? 'postgres://assistant:assistant@localhost:5432/janux_harness_test';
// Probed where the connection actually points: a hardcoded 5432 skips the whole
// suite in silence whenever JANUX_TEST_PG names another port.
const { hostname, port } = new URL(PG_URL);
// Bun reports a refused connection as ConnectionRefused/"Unable to connect" (no ECONNREFUSED).
const reachable = await fetch(`http://${hostname}:${port || 5432}`).catch((error) =>
  /ECONNREFUSED|ConnectionRefused|Unable to connect/i.test(`${error?.code ?? ''} ${error.cause ?? error}`) ? undefined : 'up',
);
const suite = reachable === undefined ? describe.skip : describe;
const storage = reachable === undefined ? undefined : await createPgStorage({ connectionString: PG_URL });
const WORKER = new URL('./__fixtures__/schedule-worker.ts', import.meta.url).pathname;

afterAll(async () => {
  await storage?.close();
});

function spawnWorker(name: string) {
  return Bun.spawn(['bun', WORKER], {
    env: { ...process.env, JANUX_TEST_PG: PG_URL, JANUX_TEST_SCHEDULE: name },
    stdout: 'pipe',
    stderr: 'inherit',
  });
}

async function readMatch(stream: ReadableStream<Uint8Array>, pattern: RegExp): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk);
    const match = buffer.match(pattern);

    if (match) return match[1]!;
  }
  throw new Error(`worker exited without matching ${pattern}`);
}

suite('scheduler survives SIGKILL mid-run (real processes, real Postgres)', () => {
  it(
    'reopens the crashed claim and resumes the durable workflow instead of restarting it',
    async () => {
      const name = 'kill-proof';

      // A pending occurrence from before this test's processes existed.
      await storage!.syncSchedules([{ name, cron: '* * * * *', nextRun: 1 }]);

      // First life: claims, starts the workflow, remembers the run id, hangs.
      const first = spawnWorker(name);
      const runId = await readMatch(first.stdout, /^CLAIMED (\S+)/m);
      const claimObservedAt = Date.now();

      first.kill('SIGKILL');
      await first.exited;

      // The occurrence is neither lost nor claimable while the lease holds.
      expect(await storage!.claimDueSchedules(claimObservedAt, 1_000)).toEqual([]);

      // Second life: a fresh process. Once the dead worker's lease expires the
      // claim reopens (at-least-once) and the remembered run id resumes the
      // suspended workflow — `begun: 1` proves step one did not run twice.
      const second = spawnWorker(name);
      const resumed = JSON.parse(await readMatch(second.stdout, /^RESUMED (.+)$/m));

      await second.exited;
      expect(resumed).toEqual({ runId, status: 'done', begun: 1 });
      // The snapshot was consumed by completion and the schedule settled ok.
      expect(await storage!.loadSnapshot(runId)).toBeUndefined();
      const [settled] = await storage!.claimDueSchedules(Date.now() + 120_000, 1_000);

      expect(settled).toMatchObject({ name, lastStatus: 'ok' });
    },
    20_000,
  );
});
