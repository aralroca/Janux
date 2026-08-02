import { QueryClient } from 'janux/query';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Invalidation scope: segment-wise key prefixes and named tags — the two
 * planes a mutation can purge, and the places their matching must not leak
 * into each other or across lookalike keys.
 */

/** Counts how many times the query function actually ran. */
function counting<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
  let calls = 0;

  return { fn: async () => ((calls += 1), value), calls: () => calls };
}

export const INVALIDATION_CASES: ScenarioCase[] = [
  // ── key prefixes are matched segment-wise ───────────────────────────────────
  {
    id: 'cache-invalidate-matches-an-object-segment-regardless-of-key-order',
    src: 'tanstack:queryClient#invalidate-partial-key',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['todos', { page: 1, size: 10 }], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['todos', { size: 10, page: 1 }]);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-invalidate-prefix-reaches-keys-with-object-segments',
    src: 'tanstack:queryClient#invalidate-prefix',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['todos', { page: 1 }], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['todos']);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-invalidate-with-an-empty-prefix-matches-everything',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const first = counting('a');
      const second = counting('b');

      await client.getQuery({ queryKey: ['a'], queryFn: first.fn }).fetch();
      await client.getQuery({ queryKey: ['b', 1], queryFn: second.fn }).fetch();
      await client.invalidateQueries([]);
      log.push(`first:${first.calls()}`, `second:${second.calls()}`);
    },
    expected: ['first:2', 'second:2'],
  },
  {
    id: 'cache-invalidate-with-a-longer-prefix-than-the-key-does-not-match',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['todos'], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['todos', 5]);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-invalidate-does-not-match-a-string-segment-against-its-number',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['user', '1'], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['user', 1]);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-the-undefined-null-collapse-leaks-into-prefix-matching',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['a', null], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['a', undefined]);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-invalidate-notifies-subscribers-with-the-refetched-data',
    src: 'tanstack:queryClient#invalidate-notifies',
    run: async (log) => {
      const client = new QueryClient();
      let version = 0;
      const query = client.getQuery({ queryKey: ['feed'], queryFn: async () => (version += 1) });

      await query.fetch();
      query.subscribe(() => {
        if (!query.state.isFetching) log.push(`saw:${query.state.data}`);
      });
      await client.invalidateQueries(['feed']);
    },
    expected: ['saw:2'],
  },

  // ── tags are the other plane ────────────────────────────────────────────────
  {
    id: 'cache-invalidate-tag-refetches-only-the-entries-carrying-it',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const tagged = counting('t');
      const plain = counting('p');

      await client.getQuery({ queryKey: ['products'], queryFn: tagged.fn, tags: ['catalog'] }).fetch();
      await client.getQuery({ queryKey: ['profile'], queryFn: plain.fn }).fetch();
      await client.invalidateTag('catalog');
      log.push(`tagged:${tagged.calls()}`, `plain:${plain.calls()}`);
    },
    expected: ['tagged:2', 'plain:1'],
  },
  {
    id: 'cache-invalidate-tag-matches-any-of-an-entrys-tags',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['page'], queryFn: source.fn, tags: ['catalog', 'homepage'] }).fetch();
      await client.invalidateTag('homepage');
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-invalidate-tag-of-an-unknown-tag-does-nothing',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['page'], queryFn: source.fn, tags: ['catalog'] }).fetch();
      await client.invalidateTag('nope');
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-invalidate-tag-swallows-a-failing-refetch',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      client.getQuery({
        queryKey: ['flaky'],
        queryFn: async () => {
          throw new Error('nope');
        },
        tags: ['catalog'],
      });
      await attempt(log, 'invalidate', () => client.invalidateTag('catalog'));
    },
    expected: ['invalidate:ok'],
  },
  {
    id: 'cache-a-tag-does-not-match-a-key-segment-with-the-same-name',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['catalog'], queryFn: source.fn }).fetch();
      await client.invalidateTag('catalog');
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-tags-declared-by-a-later-observer-are-honoured',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['page'], queryFn: source.fn }).fetch();
      client.getQuery({ queryKey: ['page'], queryFn: source.fn, tags: ['catalog'] });
      await client.invalidateTag('catalog');
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
];
