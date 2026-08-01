import { QueryClient } from 'janux/query';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `settle()`: how SSR waits for the queries a render started. Bounded twice —
 * by rounds, so a query that retriggers itself cannot loop, and by a deadline,
 * so a `queryFn` that never resolves costs milliseconds, not a response that
 * never ends.
 */

export const SETTLE_CASES: ScenarioCase[] = [
  {
    id: 'cache-settle-resolves-immediately-when-nothing-is-in-flight',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['done'], queryFn: async () => 'v' }).fetch();
      await attempt(log, 'settle', () => client.settle());
    },
    expected: ['settle:ok'],
  },
  {
    id: 'cache-settle-waits-for-an-in-flight-fetch',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const query = client.getQuery({
        queryKey: ['slowish'],
        queryFn: () => new Promise<string>((done) => setTimeout(() => done('v'), 5)),
      });

      query.fetch().catch(() => undefined);
      await client.settle();
      log.push(`status:${query.state.status}`, `data:${query.state.data}`);
    },
    expected: ['status:success', 'data:v'],
  },
  {
    id: 'cache-settle-follows-a-fetch-waterfall',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const order: string[] = [];
      const first = client.getQuery({ queryKey: ['w1'], queryFn: async () => (order.push('one'), 1) });

      first.fetch().then(() => {
        client.getQuery({ queryKey: ['w2'], queryFn: async () => (order.push('two'), 2) }).fetch();
      });
      await client.settle();
      log.push(order.join(','));
    },
    expected: ['one,two'],
  },
  {
    id: 'cache-settle-gives-up-at-its-deadline-instead-of-hanging-the-response',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['never'], queryFn: () => new Promise<string>(() => undefined) });

      query.fetch().catch(() => undefined);
      await client.settle({ timeoutMs: 20 });
      log.push(`still-fetching:${query.state.isFetching}`);
    },
    expected: ['still-fetching:true'],
  },
  {
    id: 'cache-settle-with-a-zero-round-budget-does-not-wait-at-all',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let resolve!: (value: string) => void;
      const query = client.getQuery({
        queryKey: ['budgeted'],
        queryFn: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      });
      const pending = query.fetch();

      await client.settle({ rounds: 0 });
      log.push(`still-fetching:${query.state.isFetching}`);
      resolve('v');
      await pending;
    },
    expected: ['still-fetching:true'],
  },
  {
    id: 'cache-settle-treats-a-failing-fetch-as-settled',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const query = client.getQuery({
        queryKey: ['flaky'],
        queryFn: async () => {
          throw new Error('nope');
        },
      });

      query.fetch().catch(() => undefined);
      await attempt(log, 'settle', () => client.settle());
      log.push(`status:${query.state.status}`);
    },
    expected: ['settle:ok', 'status:error'],
  },
  {
    id: 'cache-settle-then-dehydrate-carries-what-the-render-fetched',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      client
        .getQuery({ queryKey: ['page-data'], queryFn: () => new Promise<string>((done) => setTimeout(() => done('v'), 5)) })
        .fetch()
        .catch(() => undefined);
      await client.settle();
      log.push(`carried:${Object.keys(client.dehydrate()).length}`);
    },
    expected: ['carried:1'],
  },
  {
    id: 'cache-settle-leaves-a-deadline-victim-out-of-the-payload',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['fast'], queryFn: async () => 'v' }).fetch();
      client
        .getQuery({ queryKey: ['stuck'], queryFn: () => new Promise<string>(() => undefined) })
        .fetch()
        .catch(() => undefined);
      await client.settle({ timeoutMs: 20 });
      log.push(`carried:${Object.keys(client.dehydrate()).join(',')}`);
    },
    expected: ['carried:["fast"]'],
  },
];
