import { signal } from 'janux';
import { QueryClient, hashKey } from 'janux/query';
import { query } from '../../janux/src/query/index';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The odd corners of a cache entry's existence: creation is lazy, a gc'd entry
 * restarts cold, data set by hand is held by reference (unlike island state,
 * which clones), and the payload key is the hash itself.
 */

/** Counts how many times the query function actually ran. */
function counting<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
  let calls = 0;

  return { fn: async () => ((calls += 1), value), calls: () => calls };
}

const tickle = (): Promise<void> => new Promise((done) => setTimeout(done, 1));

export const ENTRY_SEMANTICS_CASES: ScenarioCase[] = [
  {
    id: 'cache-get-query-creates-the-entry-without-fetching',
    src: 'tanstack:queryCache#build-is-lazy',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      client.getQuery({ queryKey: ['lazy'], queryFn: source.fn });
      await client.settle();
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:0'],
  },
  {
    id: 'cache-after-gc-the-key-restarts-cold',
    src: 'tanstack:queryCache#gc-resets',
    run: async (log) => {
      const client = new QueryClient();
      const options = { queryKey: ['cold'], queryFn: async () => 'v', gcTime: 0 };
      const query = client.getQuery(options);

      await query.fetch();
      query.subscribe(() => undefined)();
      await tickle();
      const fresh = client.getQuery(options);

      log.push(`status:${fresh.state.status}`, `updatedAt:${fresh.state.updatedAt}`);
    },
    expected: ['status:pending', 'updatedAt:0'],
  },
  {
    id: 'cache-a-fetch-landing-after-gc-writes-into-an-orphan',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let resolve!: (value: string) => void;
      const options = {
        queryKey: ['orphan'],
        queryFn: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
        gcTime: 0,
      };
      const query = client.getQuery(options);
      const pending = query.fetch();

      query.subscribe(() => undefined)();
      await tickle();
      resolve('late');
      log.push(`result:${await pending}`, `readable:${String(client.getQueryData(['orphan']))}`);
    },
    expected: ['result:late', 'readable:undefined'],
  },
  {
    id: 'cache-a-query-fn-resolving-undefined-is-success-but-never-dehydrated',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['void'], queryFn: async () => undefined });

      await query.fetch();
      log.push(`status:${query.state.status}`, `carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['status:success', 'carried:0'],
  },
  {
    id: 'cache-set-query-data-holds-the-reference-not-a-clone',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const held = { count: 1 };

      await client.getQuery({ queryKey: ['byref'], queryFn: async () => ({ count: 0 }) }).fetch();
      client.setQueryData(['byref'], held);
      held.count = 2;
      log.push(
        `same:${client.getQueryData(['byref']) === held}`,
        `count:${(client.getQueryData(['byref']) as { count: number }).count}`,
      );
    },
    expected: ['same:true', 'count:2'],
  },
  {
    id: 'cache-the-dehydrated-payload-is-keyed-by-the-hash-itself',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['user', { id: 7 }], queryFn: async () => 'v' }).fetch();
      log.push(`keyed-by-hash:${Object.keys(client.dehydrate())[0] === hashKey(['user', { id: 7 }])}`);
    },
    expected: ['keyed-by-hash:true'],
  },
  {
    id: 'cache-release-expected-does-not-refetch-an-entry-that-is-still-fresh',
    src: 'janux',
    run: async (log) => {
      let now = 1_000;
      const client = new QueryClient(() => now);
      const source = counting('v');
      const options = { queryKey: ['fresh-release'], queryFn: source.fn, staleTime: 10_000 };
      const query = client.getQuery(options);

      await query.fetch();
      query.subscribe(() => undefined);
      client.expect([hashKey(['fresh-release'])]);
      client.releaseExpected();
      await client.settle({ timeoutMs: 50 });
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-invalidating-an-empty-client-resolves-quietly',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await attempt(log, 'invalidate', () => client.invalidateQueries());
      await attempt(log, 'tag', () => client.invalidateTag('anything'));
    },
    expected: ['invalidate:ok', 'tag:ok'],
  },
  {
    id: 'query-refetch-targets-the-entry-the-handle-currently-observes',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const id = signal(1);
      const first = counting('one');
      const second = counting('two');
      const handle = query(
        () => ({ queryKey: ['switching', id.value], queryFn: id.value === 1 ? first.fn : second.fn }),
        client,
      );

      await tickle();
      id.value = 2;
      await tickle();
      await handle.refetch();
      log.push(`first:${first.calls()}`, `second:${second.calls()}`, `data:${handle.data.value}`);
    },
    expected: ['first:1', 'second:2', 'data:two'],
  },
];
