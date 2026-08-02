import { QueryClient, hashKey, type QueryState } from 'janux/query';
import { type ScenarioCase } from '../support/scenario';

/**
 * Dehydrate/hydrate: what may cross the wire, in which direction data may
 * move, and the `expect`/`release` protocol for entries the server is still
 * streaming. The one invariant: nothing is quietly mangled on the way over —
 * an entry that cannot travel as plain JSON is left out, and hydration fills
 * gaps without ever moving data backwards.
 */

function success(data: unknown, updatedAt: number): QueryState<unknown> {
  return { status: 'success', data, error: undefined, isFetching: false, updatedAt };
}

/** Counts how many times the query function actually ran. */
function counting<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
  let calls = 0;

  return { fn: async () => ((calls += 1), value), calls: () => calls };
}

export const HYDRATION_BOUNDARY_CASES: ScenarioCase[] = [
  // ── dehydrate: what is allowed to travel ────────────────────────────────────
  {
    id: 'cache-dehydrate-leaves-out-map-data-instead-of-shipping-an-empty-object',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['map'], queryFn: async () => new Map([['k', 1]]) }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-leaves-out-non-finite-numbers',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['nan'], queryFn: async () => Number.NaN }).fetch();
      await client.getQuery({ queryKey: ['inf'], queryFn: async () => Number.POSITIVE_INFINITY }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-leaves-out-an-array-holding-undefined',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['arr'], queryFn: async () => ['ok', undefined] }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-keeps-an-object-with-an-undefined-property',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['obj'], queryFn: async () => ({ a: 1, b: undefined }) }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:1'],
  },
  {
    id: 'cache-dehydrate-leaves-out-a-date',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['date'], queryFn: async () => new Date(0) }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-leaves-out-a-class-instance',
    src: 'janux',
    run: async (log) => {
      class Money {
        cents = 100;
      }
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['money'], queryFn: async () => new Money() }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-rejects-cyclic-data-without-overflowing',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const cyclic: Record<string, unknown> = { name: 'loop' };

      cyclic.self = cyclic;
      await client.getQuery({ queryKey: ['cycle'], queryFn: async () => cyclic }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },
  {
    id: 'cache-dehydrate-keeps-nested-plain-data-with-nulls',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['plain'], queryFn: async () => ({ rows: [{ id: 1, note: null }] }) }).fetch();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:1'],
  },
  {
    id: 'cache-dehydrate-leaves-out-an-entry-that-never-fetched',
    src: 'tanstack:hydration#dehydrate-pending',
    run: (log) => {
      const client = new QueryClient();

      client.getQuery({ queryKey: ['pending'], queryFn: async () => 'v' });
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:0'],
  },

  // ── hydrate: direction of travel ────────────────────────────────────────────
  {
    id: 'cache-hydrate-never-moves-data-backwards',
    src: 'janux',
    run: async (log) => {
      let now = 5_000;
      const client = new QueryClient(() => now);

      await client.getQuery({ queryKey: ['fresh'], queryFn: async () => 'client' }).fetch();
      client.hydrate({ [hashKey(['fresh'])]: success('stale-payload', 4_000) });
      log.push(`data:${client.getQueryData(['fresh'])}`);
    },
    expected: ['data:client'],
  },
  {
    id: 'cache-hydrate-with-an-equal-timestamp-lets-the-payload-win',
    src: 'janux',
    run: async (log) => {
      const now = 5_000;
      const client = new QueryClient(() => now);

      await client.getQuery({ queryKey: ['tie'], queryFn: async () => 'client' }).fetch();
      client.hydrate({ [hashKey(['tie'])]: success('payload', 5_000) });
      log.push(`data:${client.getQueryData(['tie'])}`);
    },
    expected: ['data:payload'],
  },
  {
    id: 'cache-hydrate-into-a-pending-entry-always-adopts',
    src: 'janux',
    run: (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['gap'], queryFn: async () => 'live' });

      client.hydrate({ [hashKey(['gap'])]: success('payload', 1) });
      log.push(`status:${query.state.status}`, `data:${query.state.data}`);
    },
    expected: ['status:success', 'data:payload'],
  },
  {
    id: 'cache-hydrate-notifies-an-existing-subscriber',
    src: 'tanstack:hydration#hydrate-notifies',
    run: (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['watched'], queryFn: async () => 'live' });

      query.subscribe(() => log.push(`saw:${query.state.data}`));
      client.hydrate({ [hashKey(['watched'])]: success('payload', 1) });
    },
    expected: ['saw:payload'],
  },
  {
    id: 'cache-an-observer-after-hydration-refetches-with-its-real-query-fn',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      client.hydrate({ [hashKey(['handoff'])]: success('payload', 1) });
      const source = counting('live');
      const query = client.getQuery({ queryKey: ['handoff'], queryFn: source.fn });

      log.push(`hydrated:${query.state.data}`);
      await query.fetch();
      log.push(`refetched:${query.state.data}`, `calls:${source.calls()}`);
    },
    expected: ['hydrated:payload', 'refetched:live', 'calls:1'],
  },
  {
    id: 'cache-the-payload-round-trips-through-json',
    src: 'tanstack:hydration#serialization',
    run: async (log) => {
      const server = new QueryClient();

      await server.getQuery({ queryKey: ['user', 7], queryFn: async () => ({ name: 'ada' }) }).fetch();
      const wire = JSON.stringify(server.dehydrate());
      const browser = new QueryClient();

      browser.hydrate(JSON.parse(wire));
      log.push(`name:${(browser.getQueryData(['user', 7]) as { name: string }).name}`);
    },
    expected: ['name:ada'],
  },

  // ── expect/release: entries the server is still streaming ──────────────────
  {
    id: 'cache-expect-marks-the-entry-awaiting-until-hydration-lands',
    src: 'janux',
    run: (log) => {
      const client = new QueryClient();
      const hash = hashKey(['streamed']);

      client.expect([hash]);
      const query = client.getQuery({ queryKey: ['streamed'], queryFn: async () => 'live' });

      log.push(`awaiting:${query.awaiting}`);
      client.hydrate({ [hash]: success('payload', 1) });
      log.push(`after:${query.awaiting}`, `data:${query.state.data}`);
    },
    expected: ['awaiting:true', 'after:false', 'data:payload'],
  },
  {
    id: 'cache-release-expected-lets-a-subscribed-stale-entry-fetch-after-all',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('live');

      client.expect([hashKey(['dropped'])]);
      const query = client.getQuery({ queryKey: ['dropped'], queryFn: source.fn });

      query.subscribe(() => undefined);
      log.push(`before:${source.calls()}`);
      client.releaseExpected();
      await query.inFlight();
      log.push(`after:${source.calls()}`, `data:${query.state.data}`);
    },
    expected: ['before:0', 'after:1', 'data:live'],
  },
  {
    id: 'cache-release-expected-leaves-an-unobserved-entry-idle',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('live');

      client.expect([hashKey(['nobody'])]);
      client.getQuery({ queryKey: ['nobody'], queryFn: source.fn });
      client.releaseExpected();
      await client.settle({ timeoutMs: 50 });
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:0'],
  },
  {
    id: 'cache-in-flight-hashes-names-exactly-the-running-fetches',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let resolve!: (value: string) => void;
      const query = client.getQuery({
        queryKey: ['running'],
        queryFn: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      });

      await client.getQuery({ queryKey: ['done'], queryFn: async () => 'x' }).fetch();
      const pending = query.fetch();

      log.push(`during:${client.inFlightHashes().join(',')}`);
      resolve('v');
      await pending;
      log.push(`after:${client.inFlightHashes().length}`);
    },
    expected: [`during:${hashKey(['running'])}`, 'after:0'],
  },
];
