import { QueryClient } from 'janux/query';
import { type ScenarioCase } from '../support/scenario';

/**
 * The lifetime of one cache entry: staleness against a hand-driven clock, the
 * stale-while-revalidate window (`swr`), what an error leaves behind, garbage
 * collection when the last subscriber leaves, and the immutability of the
 * state object observers hold.
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

/** A queryFn the scenario resolves by hand, for asserting mid-flight states. */
function deferred<T>(): { fn: () => Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;

  return {
    fn: () =>
      new Promise<T>((done) => {
        resolve = done;
      }),
    resolve: (value) => resolve(value),
  };
}

const tickle = (): Promise<void> => new Promise((done) => setTimeout(done, 1));

export const CLIENT_LIFECYCLE_CASES: ScenarioCase[] = [
  // ── mid-flight observability ────────────────────────────────────────────────
  {
    id: 'cache-is-fetching-is-true-while-the-query-function-runs',
    src: 'tanstack:query#isFetching',
    run: async (log) => {
      const { client } = clocked();
      const source = deferred<string>();
      const query = client.getQuery({ queryKey: ['lc-flight'], queryFn: source.fn });
      const pending = query.fetch();

      log.push(`during:${query.state.isFetching}`);
      source.resolve('v');
      await pending;
      log.push(`after:${query.state.isFetching}`);
    },
    expected: ['during:true', 'after:false'],
  },
  {
    id: 'cache-a-refetch-keeps-showing-the-previous-data-while-in-flight',
    src: 'tanstack:query#background-refetch',
    run: async (log) => {
      const { client } = clocked();
      const source = deferred<string>();
      const query = client.getQuery({ queryKey: ['lc-swr-flight'], queryFn: source.fn });
      const first = query.fetch();

      source.resolve('first');
      await first;
      const second = query.fetch();

      log.push(`status:${query.state.status}`, `data:${query.state.data}`, `fetching:${query.state.isFetching}`);
      source.resolve('second');
      await second;
      log.push(`after:${query.state.data}`);
    },
    expected: ['status:success', 'data:first', 'fetching:true', 'after:second'],
  },
  {
    id: 'cache-updated-at-records-when-the-fetch-finished-not-when-it-started',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const source = deferred<string>();
      const query = client.getQuery({ queryKey: ['lc-updated'], queryFn: source.fn });
      const pending = query.fetch();

      tick(500);
      source.resolve('v');
      await pending;
      log.push(`updatedAt:${query.state.updatedAt}`);
    },
    expected: ['updatedAt:1500'],
  },
  {
    id: 'cache-invalidate-during-an-in-flight-fetch-joins-it-instead-of-refetching',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      let calls = 0;
      const source = deferred<string>();
      const query = client.getQuery({
        queryKey: ['lc-inflight-invalidate'],
        queryFn: () => ((calls += 1), source.fn()),
      });
      const pending = query.fetch();
      const invalidated = client.invalidateQueries(['lc-inflight-invalidate']);

      source.resolve('v');
      await Promise.all([pending, invalidated]);
      log.push(`calls:${calls}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'cache-set-query-data-during-a-fetch-loses-to-the-fetch-that-lands-after-it',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const source = deferred<string>();
      const query = client.getQuery({ queryKey: ['lc-race'], queryFn: source.fn });
      const pending = query.fetch();

      client.setQueryData(['lc-race'], 'manual');
      log.push(`during:${query.state.data}`);
      source.resolve('fetched');
      await pending;
      log.push(`after:${query.state.data}`);
    },
    expected: ['during:manual', 'after:fetched'],
  },

  // ── what an error leaves behind ─────────────────────────────────────────────
  {
    id: 'cache-a-failed-refetch-keeps-the-last-data-and-its-timestamp',
    src: 'tanstack:query#error-keeps-data',
    run: async (log) => {
      const { client, tick } = clocked();
      let fail = false;
      const query = client.getQuery({
        queryKey: ['lc-error-retention'],
        queryFn: async () => {
          if (fail) throw new Error('down');

          return 'good';
        },
      });

      await query.fetch();
      fail = true;
      tick(500);
      await query.fetch().catch(() => undefined);
      log.push(`status:${query.state.status}`, `data:${query.state.data}`, `updatedAt:${query.state.updatedAt}`);
    },
    expected: ['status:error', 'data:good', 'updatedAt:1000'],
  },
  {
    id: 'cache-set-query-data-clears-a-previous-error',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({
        queryKey: ['lc-error-clear'],
        queryFn: async () => {
          throw new Error('down');
        },
      });

      await query.fetch().catch(() => undefined);
      client.setQueryData(['lc-error-clear'], 'seeded');
      log.push(`status:${query.state.status}`, `error:${String(query.state.error)}`, `data:${query.state.data}`);
    },
    expected: ['status:success', 'error:undefined', 'data:seeded'],
  },

  // ── the swr window ──────────────────────────────────────────────────────────
  {
    id: 'cache-stale-data-within-the-swr-window-is-still-shown',
    src: 'tanstack:query#stale-while-revalidate',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-swr-in'], queryFn: async () => 'v', staleTime: 100, swr: 100 });

      await query.fetch();
      tick(150);
      log.push(`stale:${query.isStale()}`, `visible:${query.visible().status}:${query.visible().data}`);
    },
    expected: ['stale:true', 'visible:success:v'],
  },
  {
    id: 'cache-data-past-the-swr-window-is-withheld-not-deleted',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-swr-out'], queryFn: async () => 'v', staleTime: 100, swr: 100 });

      await query.fetch();
      tick(250);
      const shown = query.visible();

      log.push(
        `visible:${shown.status}:${String(shown.data)}`,
        `held:${query.state.status}:${query.state.data}`,
        `updatedAt:${query.state.updatedAt}`,
      );
    },
    expected: ['visible:pending:undefined', 'held:success:v', 'updatedAt:1000'],
  },
  {
    id: 'cache-expiry-lands-exactly-at-stale-time-plus-swr',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-swr-edge'], queryFn: async () => 'v', staleTime: 100, swr: 100 });

      await query.fetch();
      tick(199);
      log.push(`before:${query.isExpired()}`);
      tick(1);
      log.push(`at:${query.isExpired()}`);
    },
    expected: ['before:false', 'at:true'],
  },
  {
    id: 'cache-an-entry-without-swr-never-expires',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-no-swr'], queryFn: async () => 'v' });

      await query.fetch();
      tick(365 * 24 * 60 * 60 * 1000);
      log.push(`expired:${query.isExpired()}`, `visible:${query.visible().status}:${query.visible().data}`);
    },
    expected: ['expired:false', 'visible:success:v'],
  },
  {
    id: 'cache-an-errored-entry-is-never-expired-by-the-swr-window',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({
        queryKey: ['lc-swr-error'],
        queryFn: async () => {
          throw new Error('x');
        },
        staleTime: 0,
        swr: 10,
      });

      await query.fetch().catch(() => undefined);
      tick(1_000);
      log.push(`expired:${query.isExpired()}`, `visible:${query.visible().status}`);
    },
    expected: ['expired:false', 'visible:error'],
  },
  {
    id: 'cache-get-query-data-respects-the-swr-expiry',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();

      await client.getQuery({ queryKey: ['lc-gqd-swr'], queryFn: async () => 'v', staleTime: 100, swr: 100 }).fetch();
      tick(150);
      log.push(`within:${String(client.getQueryData(['lc-gqd-swr']))}`);
      tick(100);
      log.push(`past:${String(client.getQueryData(['lc-gqd-swr']))}`);
    },
    expected: ['within:v', 'past:undefined'],
  },
  {
    id: 'cache-set-query-data-revives-an-expired-entry',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-revive'], queryFn: async () => 'v', staleTime: 100, swr: 100 });

      await query.fetch();
      tick(500);
      log.push(`expired:${String(query.visible().data)}`);
      client.setQueryData(['lc-revive'], 'fresh');
      log.push(`revived:${query.visible().status}:${query.visible().data}`);
    },
    expected: ['expired:undefined', 'revived:success:fresh'],
  },

  // ── staleness against a moving clock ────────────────────────────────────────
  {
    id: 'cache-a-later-get-query-updates-the-stale-window-of-the-entry',
    src: 'tanstack:query#options-are-per-observer',
    run: async (log) => {
      const { client } = clocked();
      const queryFn = async () => 'v';

      await client.getQuery({ queryKey: ['lc-setopts'], queryFn, staleTime: 10_000 }).fetch();
      log.push(`long:${client.getQuery({ queryKey: ['lc-setopts'], queryFn, staleTime: 10_000 }).isStale()}`);
      log.push(`short:${client.getQuery({ queryKey: ['lc-setopts'], queryFn, staleTime: 0 }).isStale()}`);
    },
    expected: ['long:false', 'short:true'],
  },
  {
    id: 'cache-a-clock-that-goes-backwards-keeps-data-fresh',
    src: 'janux',
    run: async (log) => {
      const { client, tick } = clocked();
      const query = client.getQuery({ queryKey: ['lc-backwards'], queryFn: async () => 'v', staleTime: 100 });

      await query.fetch();
      tick(-500);
      log.push(`stale:${query.isStale()}`);
    },
    expected: ['stale:false'],
  },

  // ── garbage collection ──────────────────────────────────────────────────────
  {
    id: 'cache-an-entry-is-dropped-after-gc-time-once-its-last-subscriber-leaves',
    src: 'tanstack:queryCache#gc',
    run: async (log) => {
      const client = new QueryClient();
      const options = { queryKey: ['lc-gc-drop'], queryFn: async () => 'v', gcTime: 0 };
      const query = client.getQuery(options);

      await query.fetch();
      query.subscribe(() => undefined)();
      await tickle();
      log.push(`data:${String(client.getQueryData(['lc-gc-drop']))}`, `recreated:${client.getQuery(options) !== query}`);
    },
    expected: ['data:undefined', 'recreated:true'],
  },
  {
    id: 'cache-resubscribing-before-gc-fires-cancels-the-drop',
    src: 'tanstack:queryCache#gc-cancelled',
    run: async (log) => {
      const client = new QueryClient();
      const options = { queryKey: ['lc-gc-cancel'], queryFn: async () => 'v', gcTime: 0 };
      const query = client.getQuery(options);

      await query.fetch();
      query.subscribe(() => undefined)();
      query.subscribe(() => undefined);
      await tickle();
      log.push(`data:${String(client.getQueryData(['lc-gc-cancel']))}`, `kept:${client.getQuery(options) === query}`);
    },
    expected: ['data:v', 'kept:true'],
  },
  {
    id: 'cache-gc-arms-only-when-the-last-subscriber-leaves',
    src: 'tanstack:queryCache#gc-last-observer',
    run: async (log) => {
      const client = new QueryClient();
      const options = { queryKey: ['lc-gc-last'], queryFn: async () => 'v', gcTime: 0 };
      const query = client.getQuery(options);

      await query.fetch();
      const stopFirst = query.subscribe(() => undefined);

      query.subscribe(() => undefined);
      stopFirst();
      await tickle();
      log.push(`data:${String(client.getQueryData(['lc-gc-last']))}`);
    },
    expected: ['data:v'],
  },
  {
    id: 'cache-an-entry-that-was-never-subscribed-is-never-gc-d',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['lc-gc-never'], queryFn: async () => 'v', gcTime: 0 });

      await query.fetch();
      await tickle();
      log.push(`data:${String(client.getQueryData(['lc-gc-never']))}`);
    },
    expected: ['data:v'],
  },

  // ── observer hygiene and cross-client isolation ─────────────────────────────
  {
    id: 'cache-unsubscribing-twice-is-harmless',
    src: 'janux',
    run: (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['lc-double-stop'], queryFn: async () => 'v' });
      const stop = query.subscribe(() => log.push('one'));

      query.subscribe(() => log.push('two'));
      stop();
      stop();
      query.setData('x');
    },
    expected: ['two'],
  },
  {
    id: 'cache-the-state-object-is-replaced-not-mutated-on-change',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['lc-immutable'], queryFn: async () => 'v' });
      const before = query.state;

      await query.fetch();
      log.push(`replaced:${query.state !== before}`, `old:${before.status}`, `new:${query.state.status}`);
    },
    expected: ['replaced:true', 'old:pending', 'new:success'],
  },
  {
    id: 'cache-two-clients-never-share-entries',
    src: 'zustand:store#two-stores',
    run: async (log) => {
      const first = new QueryClient();
      const second = new QueryClient();

      await first.getQuery({ queryKey: ['lc-isolated'], queryFn: async () => 'A' }).fetch();
      log.push(`second-sees:${String(second.getQueryData(['lc-isolated']))}`);
    },
    expected: ['second-sees:undefined'],
  },
  {
    id: 'cache-a-bigint-key-segment-is-rejected-loudly-not-silently-collapsed',
    src: 'janux',
    run: (log) => {
      const { client } = clocked();

      try {
        client.getQuery({ queryKey: [1n], queryFn: async () => 'v' });
        log.push('accepted');
      } catch {
        log.push('threw');
      }
    },
    expected: ['threw'],
  },
];
