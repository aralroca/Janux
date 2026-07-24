import { describe, expect, it } from 'bun:test';
import { QueryClient, hashKey, mutation } from 'janux/query';

/** Every non-obvious claim in reference/data-cache-api.md, asserted. */

describe('reference/data-cache-api.md', () => {
  it('hashKey sorts object keys, so key order never splits a cache entry', () => {
    expect(hashKey(['p', { a: 1, b: 2 }])).toBe(hashKey(['p', { b: 2, a: 1 }]));
    expect(hashKey(['p', 1])).not.toBe(hashKey(['p', 2]));
  });

  it('invalidateQueries matches by key prefix', async () => {
    const client = new QueryClient();
    const fetched: string[] = [];
    const seed = (key: readonly unknown[], label: string) =>
      client.getQuery({
        queryKey: key,
        queryFn: async () => {
          fetched.push(label);

          return label;
        },
      });

    await seed(['cart'], 'cart').fetch();
    await seed(['cart', 'summary'], 'summary').fetch();
    await seed(['catalog'], 'catalog').fetch();
    fetched.length = 0;

    await client.invalidateQueries(['cart']);

    expect(fetched.sort()).toEqual(['cart', 'summary']); // prefix match, catalog untouched
  });

  it('setQueryData/getQueryData read and write an entry directly', async () => {
    const client = new QueryClient();
    const options = { queryKey: ['n'], queryFn: async () => 1 };

    await client.getQuery(options).fetch();

    expect(client.getQueryData(['n'])).toBe(1);
    client.setQueryData(['n'], 42);

    expect(client.getQueryData(['n'])).toBe(42);
    expect(client.getQueryData(['missing'])).toBeUndefined();
  });

  it('dehydrate/hydrate round-trips the cache for SSR handoff', async () => {
    const server = new QueryClient();

    await server.getQuery({ queryKey: ['n'], queryFn: async () => 7 }).fetch();
    const client = new QueryClient();

    client.hydrate(server.dehydrate());

    expect(client.getQueryData(['n'])).toBe(7);
  });

  it('runs the mutation lifecycle in order and hands onMutate ctx to onSuccess', async () => {
    const calls: string[] = [];
    const handle = mutation(
      {
        mutationFn: async (vars: { id: string }) => `ok:${vars.id}`,
        onMutate: (vars) => {
          calls.push(`mutate:${vars.id}`);

          return { rollback: true };
        },
        onSuccess: (data, _vars, ctx) => calls.push(`success:${data}:${JSON.stringify(ctx)}`),
        onSettled: () => calls.push('settled'),
      },
      new QueryClient(),
    );

    expect(handle.isPending.value).toBe(false);
    const result = await handle.mutate({ id: 'sku-1' });

    expect(result).toBe('ok:sku-1');
    expect(handle.isPending.value).toBe(false);
    expect(calls).toEqual(['mutate:sku-1', 'success:ok:sku-1:{"rollback":true}', 'settled']);
  });

  it('gives onError the ctx from onMutate so an optimistic update can roll back', async () => {
    const calls: string[] = [];
    const handle = mutation(
      {
        mutationFn: async () => {
          throw new Error('boom');
        },
        onMutate: () => ({ snapshot: 1 }),
        onError: (error, _vars, ctx) => calls.push(`error:${(error as Error).message}:${JSON.stringify(ctx)}`),
        onSettled: () => calls.push('settled'),
      },
      new QueryClient(),
    );

    await handle.mutate(undefined).catch(() => undefined);

    expect(calls).toEqual(['error:boom:{"snapshot":1}', 'settled']);
    expect(handle.isPending.value).toBe(false);
  });
});
