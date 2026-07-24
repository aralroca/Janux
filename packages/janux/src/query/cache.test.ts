import { describe, expect, it, mock } from 'bun:test';
import { QueryClient, hashKey } from './cache';

describe('QueryClient cache core', () => {
  it('hashes keys order-independently for nested objects', () => {
    expect(hashKey(['o', { a: 1, b: 2 }])).toBe(hashKey(['o', { b: 2, a: 1 }]));
    expect(hashKey(['o', 1])).not.toBe(hashKey(['o', 2]));
  });

  it('dedupes concurrent fetches into one queryFn call', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => 'value');
    const q = client.getQuery({ queryKey: ['k'], queryFn });

    await Promise.all([q.fetch(), q.fetch()]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(q.state.data).toBe('value');
  });

  it('honors staleTime with an injectable clock', async () => {
    let now = 0;
    const client = new QueryClient(() => now);
    const queryFn = mock(async () => 'v');
    const options = { queryKey: ['k'], queryFn, staleTime: 1000 };

    await client.getQuery(options).fetch();
    now = 500;
    expect(client.getQuery(options).isStale()).toBe(false);
    now = 1500;
    expect(client.getQuery(options).isStale()).toBe(true);
  });

  it('setQueryData updates observers synchronously', () => {
    const client = new QueryClient();
    const q = client.getQuery<number>({ queryKey: ['n'], queryFn: async () => 0 });
    const seen: (number | undefined)[] = [];

    q.subscribe(() => seen.push(q.state.data));
    client.setQueryData(['n'], 7);
    expect(seen).toEqual([7]);
  });

  it('mutate rolls back through onError with the onMutate context', async () => {
    const client = new QueryClient();
    const events: string[] = [];
    const failing = client.mutate(
      {
        mutationFn: async () => {
          throw new Error('boom');
        },
        onMutate: () => {
          events.push('mutate');

          return { snapshot: 1 };
        },
        onError: (_error, _vars, ctx) => events.push(`rollback:${(ctx as any).snapshot}`),
        onSettled: () => events.push('settled'),
      },
      { id: 'x' },
    );

    await expect(failing).rejects.toThrow('boom');
    expect(events).toEqual(['mutate', 'rollback:1', 'settled']);
  });

  it('invalidateQueries refetches matching observed queries', async () => {
    const client = new QueryClient();
    let count = 0;
    const q = client.getQuery({ queryKey: ['list'], queryFn: async () => ++count });

    q.subscribe(() => {});
    await q.fetch();
    await client.invalidateQueries(['list']);
    expect(q.state.data).toBe(2);
  });

  it('dehydrate/hydrate round-trips successful entries', () => {
    const source = new QueryClient();
    const q = source.getQuery<string>({ queryKey: ['seed'], queryFn: async () => 'x' });

    q.setData('hello');
    const target = new QueryClient();

    target.hydrate(source.dehydrate());
    expect(target.getQueryData<string>(['seed'])).toBe('hello');
  });
});
