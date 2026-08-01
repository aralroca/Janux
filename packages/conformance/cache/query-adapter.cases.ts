import { signal } from 'janux';
import { QueryClient, hashKey } from 'janux/query';
import { query, useQuery } from '../../janux/src/query/index';
import { type ScenarioCase } from '../support/scenario';

/**
 * The signal adapter over the QueryClient: `query()` mirrors one cache entry
 * into signals, switches entries when a reactive key changes, respects the
 * server's "this entry is coming down the stream" mark, and `useQuery()`
 * keeps one stable handle per (bag, id).
 */

/** A client whose clock the scenario advances by hand. */
function clocked(): { client: QueryClient; tick: (ms: number) => void } {
  let now = 1_000;

  return {
    client: new QueryClient(() => now),
    tick: (ms) => {
      now += ms;
    },
  };
}

/** Counts how many times the query function actually ran. */
function counting<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
  let calls = 0;

  return { fn: async () => ((calls += 1), value), calls: () => calls };
}

const tickle = (): Promise<void> => new Promise((done) => setTimeout(done, 1));

export const QUERY_ADAPTER_CASES: ScenarioCase[] = [
  {
    id: 'query-starts-pending-and-fetching-synchronously',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const handle = query({ queryKey: ['qa-start'], queryFn: async () => 'v' }, client);

      log.push(`pending:${handle.isPending.value}`, `fetching:${handle.isFetching.value}`);
      await tickle();
    },
    expected: ['pending:true', 'fetching:true'],
  },
  {
    id: 'query-resolves-its-data-into-the-signals',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const handle = query({ queryKey: ['qa-data'], queryFn: async () => 'v' }, client);

      await tickle();
      log.push(`data:${handle.data.value}`, `pending:${handle.isPending.value}`, `fetching:${handle.isFetching.value}`);
    },
    expected: ['data:v', 'pending:false', 'fetching:false'],
  },
  {
    id: 'query-a-failed-refetch-fills-the-error-signal-and-keeps-the-data-signal',
    src: 'tanstack:query#error-keeps-data',
    run: async (log) => {
      const { client } = clocked();
      let fail = false;
      const handle = query(
        {
          queryKey: ['qa-error'],
          queryFn: async () => {
            if (fail) throw new Error('boom');

            return 'ok';
          },
        },
        client,
      );

      await tickle();
      fail = true;
      let caught = '';

      await handle.refetch().catch((error) => (caught = (error as Error).message));
      log.push(
        `caught:${caught}`,
        `error:${(handle.error.value as Error).message}`,
        `data:${handle.data.value}`,
        `pending:${handle.isPending.value}`,
      );
    },
    expected: ['caught:boom', 'error:boom', 'data:ok', 'pending:false'],
  },
  {
    id: 'query-a-fresh-entry-is-not-refetched-when-observed',
    src: 'tanstack:query#no-refetch-when-fresh',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');
      const options = { queryKey: ['qa-fresh'], queryFn: source.fn, staleTime: 10_000 };

      await client.getQuery(options).fetch();
      const handle = query(options, client);

      await tickle();
      log.push(`data:${handle.data.value}`, `calls:${source.calls()}`);
    },
    expected: ['data:v', 'calls:1'],
  },
  {
    id: 'query-a-stale-entry-shows-its-data-while-refetching-in-the-background',
    src: 'tanstack:query#stale-while-revalidate',
    run: async (log) => {
      const { client, tick } = clocked();
      let version = 0;
      const options = { queryKey: ['qa-stale'], queryFn: async () => `v${(version += 1)}`, staleTime: 100 };

      await client.getQuery(options).fetch();
      tick(200);
      const handle = query(options, client);

      log.push(`immediate:${handle.data.value}`, `fetching:${handle.isFetching.value}`);
      await tickle();
      log.push(`refetched:${handle.data.value}`);
    },
    expected: ['immediate:v1', 'fetching:true', 'refetched:v2'],
  },
  {
    id: 'query-data-past-the-swr-window-renders-pending-not-something-too-old',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      let version = 0;
      const options = {
        queryKey: ['qa-expired'],
        queryFn: async () => `v${(version += 1)}`,
        staleTime: 100,
        swr: 100,
      };

      await client.getQuery(options).fetch();
      tick(500);
      const handle = query(options, client);

      log.push(`immediate:${String(handle.data.value)}`, `pending:${handle.isPending.value}`);
      await tickle();
      log.push(`after:${handle.data.value}`);
    },
    expected: ['immediate:undefined', 'pending:true', 'after:v2'],
  },
  {
    id: 'query-an-awaiting-entry-renders-pending-without-firing-the-request',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('live');

      client.expect([hashKey(['qa-awaiting'])]);
      const handle = query({ queryKey: ['qa-awaiting'], queryFn: source.fn }, client);

      await tickle();
      log.push(`calls:${source.calls()}`, `pending:${handle.isPending.value}`);
    },
    expected: ['calls:0', 'pending:true'],
  },
  {
    id: 'query-release-expected-lets-the-observer-fetch-after-all',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('live');

      client.expect([hashKey(['qa-released'])]);
      const handle = query({ queryKey: ['qa-released'], queryFn: source.fn }, client);

      await tickle();
      client.releaseExpected();
      await tickle();
      log.push(`calls:${source.calls()}`, `data:${handle.data.value}`);
    },
    expected: ['calls:1', 'data:live'],
  },
  {
    id: 'query-hydration-arriving-mid-wait-feeds-the-signals-without-a-fetch',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('live');
      const hash = hashKey(['qa-streamed']);

      client.expect([hash]);
      const handle = query({ queryKey: ['qa-streamed'], queryFn: source.fn }, client);

      await tickle();
      client.hydrate({ [hash]: { status: 'success', data: 'payload', error: undefined, isFetching: false, updatedAt: Date.now() + 60_000 } });
      await tickle();
      log.push(`data:${handle.data.value}`, `calls:${source.calls()}`);
    },
    expected: ['data:payload', 'calls:0'],
  },
  {
    id: 'query-a-reactive-key-switches-the-observed-entry',
    src: 'tanstack:query#query-key-change',
    run: async (log) => {
      const client = new QueryClient();
      const id = signal(1);
      const handle = query(() => ({ queryKey: ['qa-user', id.value], queryFn: async () => `user-${id.value}` }), client);

      await tickle();
      log.push(`first:${handle.data.value}`);
      id.value = 2;
      await tickle();
      log.push(`second:${handle.data.value}`);
    },
    expected: ['first:user-1', 'second:user-2'],
  },
  {
    id: 'query-switching-back-to-a-cached-key-shows-its-data-immediately',
    src: 'tanstack:query#cached-key-return',
    run: async (log) => {
      const client = new QueryClient();
      const id = signal(1);
      const handle = query(() => ({ queryKey: ['qa-back', id.value], queryFn: async () => `user-${id.value}` }), client);

      await tickle();
      id.value = 2;
      await tickle();
      id.value = 1;
      log.push(`immediate:${handle.data.value}`, `pending:${handle.isPending.value}`);
      await tickle();
    },
    expected: ['immediate:user-1', 'pending:false'],
  },
  {
    id: 'query-a-key-switch-stops-notifications-from-the-abandoned-entry',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const id = signal(1);
      const handle = query(() => ({ queryKey: ['qa-stale-sub', id.value], queryFn: async () => `user-${id.value}` }), client);

      await tickle();
      id.value = 2;
      await tickle();
      client.setQueryData(['qa-stale-sub', 1], 'edited-behind-your-back');
      log.push(`data:${handle.data.value}`);
    },
    expected: ['data:user-2'],
  },
  {
    id: 'query-two-handles-of-one-key-share-one-fetch-and-both-see-the-data',
    src: 'tanstack:query#shared-observers',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');
      const options = { queryKey: ['qa-shared'], queryFn: source.fn };
      const first = query(options, client);
      const second = query(options, client);

      await tickle();
      log.push(`first:${first.data.value}`, `second:${second.data.value}`, `calls:${source.calls()}`);
    },
    expected: ['first:v', 'second:v', 'calls:1'],
  },
  {
    id: 'query-set-query-data-flows-into-the-signals',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const handle = query({ queryKey: ['qa-seeded'], queryFn: async () => 'fetched' }, client);

      await tickle();
      client.setQueryData(['qa-seeded'], 'edited');
      log.push(`data:${handle.data.value}`);
    },
    expected: ['data:edited'],
  },
  {
    id: 'query-invalidation-flows-into-the-signals',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let version = 0;
      const handle = query({ queryKey: ['qa-invalidated'], queryFn: async () => `v${(version += 1)}` }, client);

      await tickle();
      await client.invalidateQueries(['qa-invalidated']);
      log.push(`data:${handle.data.value}`);
    },
    expected: ['data:v2'],
  },
  {
    id: 'query-is-fetching-tracks-a-background-refetch',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let resolve!: (value: string) => void;
      let first = true;
      const handle = query(
        {
          queryKey: ['qa-fetching'],
          queryFn: () => {
            if (first) {
              first = false;

              return Promise.resolve('one');
            }

            return new Promise<string>((done) => {
              resolve = done;
            });
          },
        },
        client,
      );

      await tickle();
      const pending = handle.refetch();

      log.push(`during:${handle.isFetching.value}:${handle.data.value}`);
      resolve('two');
      await pending;
      log.push(`after:${handle.isFetching.value}:${handle.data.value}`);
    },
    expected: ['during:true:one', 'after:false:two'],
  },
  {
    id: 'query-use-query-returns-the-same-handle-per-bag-and-id',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const bag = {};
      const make = () => useQuery(bag, 'list', () => ({ queryKey: ['qa-uq'], queryFn: async () => 'v' }), client);

      log.push(`stable:${make() === make()}`);
      await tickle();
    },
    expected: ['stable:true'],
  },
  {
    id: 'query-use-query-distinguishes-ids-within-one-bag',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const bag = {};
      const first = useQuery(bag, 'one', () => ({ queryKey: ['qa-uq-one'], queryFn: async () => 1 }), client);
      const second = useQuery(bag, 'two', () => ({ queryKey: ['qa-uq-two'], queryFn: async () => 2 }), client);

      await tickle();
      log.push(`distinct:${first !== second}`, `one:${first.data.value}`, `two:${second.data.value}`);
    },
    expected: ['distinct:true', 'one:1', 'two:2'],
  },
  {
    id: 'query-use-query-gives-each-bag-its-own-handle',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const make = (bag: object) =>
        useQuery(bag, 'list', () => ({ queryKey: ['qa-uq-bags'], queryFn: async () => 'v' }), client);

      log.push(`distinct:${make({}) !== make({})}`);
      await tickle();
    },
    expected: ['distinct:true'],
  },
];
