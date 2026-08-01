import { QueryClient } from 'janux/query';
import { mutation } from '../../janux/src/query/index';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Mutation hook semantics beyond the happy path the existing corpus covers:
 * which hooks run when a hook itself throws, what the optimistic
 * update-and-rollback pattern looks like end to end, and what a mutation does
 * NOT do (auto-invalidate, participate in `settle()`).
 */

/** Counts how many times the query function actually ran. */
function counting<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
  let calls = 0;

  return { fn: async () => ((calls += 1), value), calls: () => calls };
}

export const MUTATION_HOOK_CASES: ScenarioCase[] = [
  {
    id: 'query-an-on-mutate-throw-skips-the-mutation-and-every-other-hook',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await attempt(log, 'mutate', () =>
        client.mutate(
          {
            mutationFn: async () => log.push('mutation-ran'),
            onMutate: () => {
              throw new Error('bad-setup');
            },
            onError: () => log.push('onError'),
            onSuccess: () => log.push('onSuccess'),
            onSettled: () => log.push('onSettled'),
          },
          1,
        ),
      );
    },
    expected: ['mutate:threw:bad-setup'],
  },
  {
    id: 'query-an-on-success-throw-lands-in-on-error-and-rejects-the-mutation',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();

      await attempt(log, 'mutate', () =>
        client.mutate(
          {
            mutationFn: async () => 'data',
            onSuccess: () => {
              throw new Error('render-side-crash');
            },
            onError: (error) => log.push(`onError:${(error as Error).message}`),
            onSettled: () => log.push('onSettled'),
          },
          1,
        ),
      );
    },
    expected: ['onError:render-side-crash', 'onSettled', 'mutate:threw:render-side-crash'],
  },
  {
    id: 'query-on-error-receives-undefined-context-without-on-mutate',
    src: 'tanstack:mutations#context-optional',
    run: async (log) => {
      const client = new QueryClient();

      await attempt(log, 'mutate', () =>
        client.mutate(
          {
            mutationFn: async () => {
              throw new Error('nope');
            },
            onError: (_error, vars, ctx) => log.push(`onError:${vars}:${String(ctx)}`),
          },
          7,
        ),
      );
    },
    expected: ['onError:7:undefined', 'mutate:threw:nope'],
  },
  {
    id: 'query-an-async-on-mutate-is-awaited-before-the-mutation-runs',
    src: 'tanstack:mutations#async-onMutate',
    run: async (log) => {
      const client = new QueryClient();

      await client.mutate(
        {
          mutationFn: async () => log.push('mutation'),
          onMutate: async () => {
            await new Promise((done) => setTimeout(done, 5));
            log.push('onMutate-done');
          },
        },
        1,
      );
    },
    expected: ['onMutate-done', 'mutation'],
  },
  {
    id: 'query-optimistic-update-rolls-back-on-error',
    src: 'tanstack:mutations#optimistic-rollback',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['todos'], queryFn: async () => ['a'] }).fetch();
      await attempt(log, 'mutate', () =>
        client.mutate(
          {
            mutationFn: async () => {
              throw new Error('server-rejected');
            },
            onMutate: (next: string) => {
              const previous = client.getQueryData<string[]>(['todos']);

              client.setQueryData(['todos'], [...previous!, next]);
              log.push(`optimistic:${JSON.stringify(client.getQueryData(['todos']))}`);

              return previous;
            },
            onError: (_error, _vars, previous) => client.setQueryData(['todos'], previous!),
          },
          'b',
        ),
      );
      log.push(`rolled-back:${JSON.stringify(client.getQueryData(['todos']))}`);
    },
    expected: ['optimistic:["a","b"]', 'mutate:threw:server-rejected', 'rolled-back:["a"]'],
  },
  {
    id: 'query-optimistic-update-is-confirmed-by-the-server-result-on-success',
    src: 'tanstack:mutations#optimistic-commit',
    run: async (log) => {
      const client = new QueryClient();

      await client.getQuery({ queryKey: ['todos'], queryFn: async () => ['a'] }).fetch();
      await client.mutate(
        {
          mutationFn: async (next: string) => ['a', `${next}-with-id`],
          onMutate: (next: string) => {
            client.setQueryData(['todos'], [...client.getQueryData<string[]>(['todos'])!, next]);
          },
          onSuccess: (fromServer) => client.setQueryData(['todos'], fromServer),
        },
        'b',
      );
      log.push(`confirmed:${JSON.stringify(client.getQueryData(['todos']))}`);
    },
    expected: ['confirmed:["a","b-with-id"]'],
  },
  {
    id: 'query-a-mutation-does-not-invalidate-anything-by-itself',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const source = counting('v');

      await client.getQuery({ queryKey: ['list'], queryFn: source.fn }).fetch();
      await client.mutate({ mutationFn: async () => 'done' }, 1);
      log.push(`calls:${source.calls()}`);
    },
    expected: ['calls:1'],
  },
  {
    id: 'query-settle-does-not-wait-for-mutations',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let resolve!: (value: string) => void;
      const pending = client.mutate(
        {
          mutationFn: () =>
            new Promise<string>((done) => {
              resolve = done;
            }),
        },
        1,
      );

      await client.settle({ timeoutMs: 1_000 });
      log.push('settled-first');
      resolve('late');
      log.push(`mutation:${await pending}`);
    },
    expected: ['settled-first', 'mutation:late'],
  },
  {
    id: 'query-the-mutation-handle-toggles-is-pending-around-the-call',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const handle = mutation({ mutationFn: async (n: number) => n * 2 }, client);

      log.push(`before:${handle.isPending.value}`);
      const pending = handle.mutate(21);

      log.push(`during:${handle.isPending.value}`);
      log.push(`result:${await pending}`, `after:${handle.isPending.value}`);
    },
    expected: ['before:false', 'during:true', 'result:42', 'after:false'],
  },
  {
    id: 'query-the-mutation-handle-clears-is-pending-when-the-mutation-rejects',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      const handle = mutation(
        {
          mutationFn: async () => {
            throw new Error('nope');
          },
        },
        client,
      );

      await attempt(log, 'mutate', () => handle.mutate(1));
      log.push(`pending:${handle.isPending.value}`);
    },
    expected: ['mutate:threw:nope', 'pending:false'],
  },
];
