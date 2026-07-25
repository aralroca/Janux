import { QueryClient } from 'janux/query';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * QueryClient behaviour: dedupe, staleness, invalidation scope, garbage
 * collection and mutation rollback.
 *
 * A fake clock is passed in rather than waiting on real time, so staleness is
 * asserted at exact boundaries instead of approximately. Cases follow
 * `tanstack:query-core/{query,queryCache,mutations}`.
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

export const CLIENT_CASES: ScenarioCase[] = [
  {
    id: 'cache-first-fetch-runs-the-query-function',
    src: 'tanstack:query#fetch',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');

      log.push(String(await client.getQuery({ queryKey: ['k'], queryFn: source.fn }).fetch()));
      log.push(`calls:${source.calls()}`);
    },
    expected: ['v', 'calls:1'],
  },
  {
    id: 'cache-concurrent-fetches-share-one-in-flight-request',
    src: 'tanstack:query#dedupe',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');
      const query = client.getQuery({ queryKey: ['k'], queryFn: source.fn });

      await Promise.all([query.fetch(), query.fetch(), query.fetch()]);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-a-second-fetch-after-settling-runs-again',
    src: 'tanstack:query#refetch',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');
      const query = client.getQuery({ queryKey: ['k'], queryFn: source.fn });

      await query.fetch();
      await query.fetch();
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-the-same-key-returns-the-same-query-object',
    src: 'tanstack:queryCache#get',
    run: (log) => {
      const { client } = clocked();
      const options = { queryKey: ['k'], queryFn: async () => 1 };

      log.push(String(client.getQuery(options) === client.getQuery({ ...options })));
    },
    expected: ['true'],
  },
  {
    id: 'cache-state-starts-pending-with-no-data',
    src: 'tanstack:query#initial-state',
    run: (log) => {
      const { client } = clocked();
      const { status, data, isFetching } = client.getQuery({ queryKey: ['k'], queryFn: async () => 1 }).state;

      log.push(`${status}:${String(data)}:${isFetching}`);
    },
    expected: ['pending:undefined:false'],
  },
  {
    id: 'cache-a-successful-fetch-records-the-time',
    src: 'tanstack:query#updatedAt',
    run: async (log) => {
      const { client, tick } = clocked();

      tick(500);
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1 });

      await query.fetch();
      log.push(`updatedAt:${query.state.updatedAt}`, `status:${query.state.status}`);
    },
    expected: ['updatedAt:1500', 'status:success'],
  },
  {
    id: 'cache-a-failed-fetch-records-the-error-and-keeps-status-error',
    src: 'tanstack:query#error-state',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          throw new Error('nope');
        },
      });

      await query.fetch().catch(() => undefined);
      log.push(`status:${query.state.status}`, `error:${(query.state.error as Error).message}`, `fetching:${query.state.isFetching}`);
    },
    expected: ['status:error', 'error:nope', 'fetching:false'],
  },
  {
    id: 'cache-a-failed-fetch-rejects-every-waiter',
    src: 'tanstack:query#shared-rejection',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          throw new Error('nope');
        },
      });
      const settled = await Promise.allSettled([query.fetch(), query.fetch()]);

      log.push(settled.map((entry) => entry.status).join(','));
    },
    expected: ['rejected,rejected'],
  },
  {
    id: 'cache-a-retry-after-a-failure-can-succeed',
    src: 'tanstack:query#recover-after-error',
    run: async (log) => {
      const { client } = clocked();
      let attemptCount = 0;
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          attemptCount += 1;
          if (attemptCount === 1) throw new Error('first');

          return 'second';
        },
      });

      await query.fetch().catch(() => undefined);
      log.push(String(await query.fetch()), `status:${query.state.status}`, `error:${String(query.state.error)}`);
    },
    expected: ['second', 'status:success', 'error:undefined'],
  },

  // ── staleness at exact boundaries ───────────────────────────────────────────
  {
    id: 'cache-is-stale-before-the-first-fetch',
    src: 'tanstack:query#stale-when-pending',
    run: (log) => {
      const { client } = clocked();

      log.push(String(client.getQuery({ queryKey: ['k'], queryFn: async () => 1 }).isStale()));
    },
    expected: ['true'],
  },
  {
    id: 'cache-default-stale-time-makes-data-stale-immediately',
    src: 'tanstack:query#staleTime-zero',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1 });

      await query.fetch();
      log.push(String(query.isStale()));
    },
    expected: ['true'],
  },
  {
    id: 'cache-fresh-within-the-stale-window',
    src: 'tanstack:query#staleTime',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1, staleTime: 1000 });

      await query.fetch();
      tick(999);
      log.push(String(query.isStale()));
    },
    expected: ['false'],
  },
  {
    id: 'cache-stale-exactly-at-the-window-edge',
    src: 'tanstack:query#staleTime-boundary',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1, staleTime: 1000 });

      await query.fetch();
      tick(1000);
      log.push(String(query.isStale()));
    },
    expected: ['true'],
  },
  {
    id: 'cache-an-errored-query-is-always-stale',
    src: 'tanstack:query#error-is-stale',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          throw new Error('x');
        },
        staleTime: 10_000,
      });

      await query.fetch().catch(() => undefined);
      log.push(String(query.isStale()));
    },
    expected: ['true'],
  },

  // ── reading and seeding ─────────────────────────────────────────────────────
  {
    id: 'cache-get-query-data-reads-a-fetched-entry',
    src: 'tanstack:queryClient#getQueryData',
    run: async (log) => {
      const { client } = clocked();

      await client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' }).fetch();
      log.push(String(client.getQueryData(['k'])));
    },
    expected: ['v'],
  },
  {
    id: 'cache-get-query-data-of-an-unknown-key-is-undefined',
    src: 'tanstack:queryClient#getQueryData-missing',
    run: (log) => log.push(String(new QueryClient().getQueryData(['nope']))),
    expected: ['undefined'],
  },
  {
    id: 'cache-set-query-data-overwrites-a-fetched-entry',
    src: 'tanstack:queryClient#setQueryData',
    run: async (log) => {
      const { client } = clocked();

      await client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' }).fetch();
      client.setQueryData(['k'], 'edited');
      log.push(String(client.getQueryData(['k'])));
    },
    expected: ['edited'],
  },
  {
    id: 'cache-set-query-data-before-any-fetch-is-a-no-op',
    src: 'janux',
    run: (log) => {
      const client = new QueryClient();

      client.setQueryData(['k'], 'seeded');
      log.push(String(client.getQueryData(['k'])));
    },
    expected: ['undefined'],
  },
  {
    id: 'cache-set-query-data-marks-the-entry-fresh',
    src: 'tanstack:queryClient#setQueryData-updatedAt',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'v', staleTime: 100 });

      await query.fetch();
      tick(500);
      log.push(`stale:${query.isStale()}`);
      client.setQueryData(['k'], 'edited');
      log.push(`after:${query.isStale()}`);
    },
    expected: ['stale:true', 'after:false'],
  },

  // ── invalidation scope ──────────────────────────────────────────────────────
  {
    id: 'cache-invalidate-refetches-an-exact-key',
    src: 'tanstack:queryClient#invalidateQueries',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');

      await client.getQuery({ queryKey: ['k'], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['k']);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:2'],
  },
  {
    id: 'cache-invalidate-refetches-descendants-of-a-prefix',
    src: 'tanstack:queryClient#invalidate-prefix',
    run: async (log) => {
      const { client } = clocked();
      const parent = counting('p');
      const child = counting('c');

      await client.getQuery({ queryKey: ['todos'], queryFn: parent.fn }).fetch();
      await client.getQuery({ queryKey: ['todos', 5], queryFn: child.fn }).fetch();
      await client.invalidateQueries(['todos']);
      log.push(`parent:${parent.calls()}`, `child:${child.calls()}`);
    },
    expected: ['parent:2', 'child:2'],
  },
  {
    id: 'cache-invalidate-does-not-touch-a-sibling-with-a-longer-name',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const todos = counting('t');
      const archive = counting('a');

      await client.getQuery({ queryKey: ['todos'], queryFn: todos.fn }).fetch();
      await client.getQuery({ queryKey: ['todosArchive'], queryFn: archive.fn }).fetch();
      await client.invalidateQueries(['todos']);
      log.push(`todos:${todos.calls()}`, `archive:${archive.calls()}`);
    },
    expected: ['todos:2', 'archive:1'],
  },
  {
    id: 'cache-invalidate-does-not-treat-a-number-as-a-string-prefix',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const one = counting(1);
      const ten = counting(10);

      await client.getQuery({ queryKey: ['user', 1], queryFn: one.fn }).fetch();
      await client.getQuery({ queryKey: ['user', 10], queryFn: ten.fn }).fetch();
      await client.invalidateQueries(['user', 1]);
      log.push(`one:${one.calls()}`, `ten:${ten.calls()}`);
    },
    expected: ['one:2', 'ten:1'],
  },
  {
    id: 'cache-invalidate-with-no-key-refetches-everything',
    src: 'tanstack:queryClient#invalidate-all',
    run: async (log) => {
      const { client } = clocked();
      const a = counting('a');
      const b = counting('b');

      await client.getQuery({ queryKey: ['a'], queryFn: a.fn }).fetch();
      await client.getQuery({ queryKey: ['b'], queryFn: b.fn }).fetch();
      await client.invalidateQueries();
      log.push(`a:${a.calls()}`, `b:${b.calls()}`);
    },
    expected: ['a:2', 'b:2'],
  },
  {
    id: 'cache-invalidate-swallows-a-failing-refetch',
    src: 'tanstack:queryClient#invalidate-error',
    run: async (log) => {
      const { client } = clocked();

      client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          throw new Error('nope');
        },
      });
      await attempt(log, 'invalidate', () => client.invalidateQueries(['k']));
    },
    expected: ['invalidate:ok'],
  },
  {
    id: 'cache-invalidate-of-an-unknown-prefix-does-nothing',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const source = counting('v');

      await client.getQuery({ queryKey: ['k'], queryFn: source.fn }).fetch();
      await client.invalidateQueries(['other']);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },

  // ── observers and garbage collection ────────────────────────────────────────
  {
    id: 'cache-a-subscriber-is-notified-on-every-state-change',
    src: 'tanstack:query#observers',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' });

      query.subscribe(() => log.push(`notify:${query.state.status}`));
      await query.fetch();
    },
    expected: ['notify:pending', 'notify:success'],
  },
  {
    id: 'cache-unsubscribing-stops-notifications',
    src: 'tanstack:query#unsubscribe',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' });
      const stop = query.subscribe(() => log.push('notify'));

      stop();
      await query.fetch();
      log.push('done');
    },
    expected: ['done'],
  },
  {
    id: 'cache-two-subscribers-are-both-notified',
    src: 'tanstack:query#multiple-observers',
    run: (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' });

      query.subscribe(() => log.push('first'));
      query.subscribe(() => log.push('second'));
      query.setData('x');
    },
    expected: ['first', 'second'],
  },

  // ── mutations ───────────────────────────────────────────────────────────────
  {
    id: 'mutate-returns-the-result-and-runs-the-success-hooks',
    src: 'tanstack:mutations#success',
    run: async (log) => {
      const { client } = clocked();
      const result = await client.mutate(
        {
          mutationFn: async (vars: number) => vars * 2,
          onMutate: async () => 'ctx',
          onSuccess: (data, vars, ctx) => log.push(`success:${data}:${vars}:${ctx}`),
          onError: () => log.push('error'),
          onSettled: () => log.push('settled'),
        },
        21,
      );

      log.push(`result:${result}`);
    },
    expected: ['success:42:21:ctx', 'settled', 'result:42'],
  },
  {
    id: 'mutate-runs-the-error-hook-with-the-optimistic-context',
    src: 'tanstack:mutations#rollback',
    run: async (log) => {
      const { client } = clocked();

      await attempt(log, 'mutate', () =>
        client.mutate(
          {
            mutationFn: async () => {
              throw new Error('nope');
            },
            onMutate: async () => 'snapshot',
            onError: (error, _vars, ctx) => log.push(`rollback:${ctx}:${(error as Error).message}`),
            onSuccess: () => log.push('success'),
            onSettled: () => log.push('settled'),
          },
          1,
        ),
      );
    },
    expected: ['rollback:snapshot:nope', 'settled', 'mutate:threw:nope'],
  },
  {
    id: 'mutate-runs-on-mutate-before-the-mutation',
    src: 'tanstack:mutations#onMutate-order',
    run: async (log) => {
      const { client } = clocked();

      await client.mutate(
        {
          mutationFn: async () => {
            log.push('mutation');
          },
          onMutate: async () => {
            log.push('onMutate');
          },
        },
        1,
      );
    },
    expected: ['onMutate', 'mutation'],
  },
  {
    id: 'mutate-settles-even-without-any-hooks',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();

      log.push(String(await client.mutate({ mutationFn: async (n: number) => n + 1 }, 1)));
    },
    expected: ['2'],
  },

  // ── dehydrate / hydrate ─────────────────────────────────────────────────────
  {
    id: 'cache-dehydrate-carries-only-successful-entries',
    src: 'tanstack:hydration#dehydrate',
    run: async (log) => {
      const { client } = clocked();

      await client.getQuery({ queryKey: ['ok'], queryFn: async () => 'v' }).fetch();
      await client
        .getQuery({
          queryKey: ['bad'],
          queryFn: async () => {
            throw new Error('x');
          },
        })
        .fetch()
        .catch(() => undefined);
      log.push(Object.keys(client.dehydrate()).join(','));
    },
    expected: ['["ok"]'],
  },
  {
    id: 'cache-hydrate-restores-readable-data',
    src: 'tanstack:hydration#hydrate',
    run: async (log) => {
      const { client } = clocked();

      await client.getQuery({ queryKey: ['k'], queryFn: async () => 'v' }).fetch();
      const fresh = new QueryClient();

      fresh.hydrate(client.dehydrate());
      log.push(String(fresh.getQueryData(['k'])));
    },
    expected: ['v'],
  },
  {
    id: 'cache-a-hydrated-entry-is-still-matched-by-prefix-invalidation',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();

      await client.getQuery({ queryKey: ['todos', 1], queryFn: async () => 'v' }).fetch();
      const fresh = new QueryClient();

      fresh.hydrate(client.dehydrate());
      await attempt(log, 'invalidate', () => fresh.invalidateQueries(['todos']));
      log.push(String(fresh.getQueryData(['todos', 1])));
    },
    expected: ['invalidate:ok', 'v'],
  },
];
