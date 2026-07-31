import { describe, expect, it, mock } from 'bun:test';
import { QueryClient } from './cache';
import { query } from './index';
import { createRoot } from '../signals';

/**
 * SSR hands the client what it already fetched. The claim under test is the one
 * anybody evaluating the framework checks in the network tab: a page whose data
 * came down in the payload must not fetch it again on mount.
 */
describe('QueryClient.settle()', () => {
  it('waits for the fetches in flight', async () => {
    const client = new QueryClient();
    let resolve: (value: string) => void = () => {};
    const entry = client.getQuery({ queryKey: ['k'], queryFn: () => new Promise<string>((r) => (resolve = r)) });

    entry.fetch().catch(() => undefined);
    const settled = client.settle();

    resolve('late');
    await settled;

    expect(client.getQueryData<string>(['k'])).toBe('late');
  });

  it('waits for a fetch that only starts because an earlier one finished', async () => {
    const client = new QueryClient();
    const second = client.getQuery({ queryKey: ['second'], queryFn: async () => 'b' });
    const first = client.getQuery({
      queryKey: ['first'],
      queryFn: async () => {
        second.fetch().catch(() => undefined);

        return 'a';
      },
    });

    first.fetch().catch(() => undefined);
    await client.settle();

    // A render that queries in a waterfall must still be fully dehydratable.
    expect(client.getQueryData<string>(['second'])).toBe('b');
  });

  it('gives up on a query that never settles, instead of holding the response open', async () => {
    const client = new QueryClient();

    client.getQuery({ queryKey: ['hung'], queryFn: () => new Promise(() => {}) }).fetch().catch(() => undefined);

    // A single hung request must not keep the whole page's response from
    // closing — the entry is simply left out and the client fetches it.
    await client.settle({ timeoutMs: 20 });

    expect(client.dehydrate()).toEqual({});
  });

  it('resolves when nothing is in flight, and does not hang on a rejection', async () => {
    const client = new QueryClient();

    await client.settle();
    client.getQuery({ queryKey: ['bad'], queryFn: async () => { throw new Error('boom'); } }).fetch().catch(() => undefined);
    await client.settle();

    expect(client.getQueryData<string>(['bad'])).toBeUndefined();
  });
});

describe('dehydrate()', () => {
  it('carries successful entries and leaves failures behind', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['ok'], queryFn: async () => ({ id: 1 }) }).fetch();
    await client.getQuery({ queryKey: ['bad'], queryFn: async () => { throw new Error('x'); } }).fetch().catch(() => undefined);

    const payload = client.dehydrate();

    expect(Object.keys(payload)).toEqual(['["ok"]']);
  });

  it('drops data that is not plain schema-shaped data, rather than shipping something broken', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['plain'], queryFn: async () => [{ id: 'p1' }] }).fetch();
    await client.getQuery({ queryKey: ['map'], queryFn: async () => new Map([['a', 1]]) }).fetch();
    await client.getQuery({ queryKey: ['fn'], queryFn: async () => ({ run: () => 1 }) }).fetch();

    const payload = client.dehydrate();

    // The state invariant is plain JSON: what cannot be expressed that way is
    // simply not serialized, and the client refetches it.
    expect(Object.keys(payload).sort()).toEqual(['["plain"]']);
  });

  it('is empty for a client nobody queried — a page without data costs no payload', () => {
    expect(new QueryClient().dehydrate()).toEqual({});
  });
});

describe('hydrate()', () => {
  it('does not fetch on mount when the payload already carried the data', async () => {
    const server = new QueryClient();
    const queryFn = mock(async () => ['a', 'b']);

    await server.getQuery({ queryKey: ['products'], queryFn, staleTime: 30_000 }).fetch();
    expect(queryFn).toHaveBeenCalledTimes(1);

    const client = new QueryClient();

    client.hydrate(server.dehydrate());
    createRoot(() => query({ queryKey: ['products'], queryFn, staleTime: 30_000 }, client));
    await Promise.resolve();

    // The whole point: one fetch in the process, on the server.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('still refetches hydrated data that declares no freshness — staleTime is the contract', async () => {
    const server = new QueryClient();
    const queryFn = mock(async () => ['a']);

    await server.getQuery({ queryKey: ['products'], queryFn }).fetch();
    const client = new QueryClient();

    client.hydrate(server.dehydrate());
    createRoot(() => query({ queryKey: ['products'], queryFn }, client));
    await Promise.resolve();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('hydrate() never moves data backwards', () => {
  it('keeps the fresher entry when a payload chunk carries an older one', async () => {
    const client = new QueryClient();

    await client.getQuery({ queryKey: ['k'], queryFn: async () => 'newer' }).fetch();
    const stale = { status: 'success' as const, data: 'older', error: undefined, isFetching: false, updatedAt: 0 };

    client.hydrate({ '["k"]': stale });

    // A late chunk describing an older read must not overwrite what the client
    // already fetched for itself.
    expect(client.getQueryData<string>(['k'])).toBe('newer');
  });
});

describe('queries still in flight when the shell goes out', () => {
  it('waits for the stream instead of restarting the request', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => ['streamed']);

    // The server said: "this one is coming, do not start it yourself".
    client.expect(['["products"]']);
    createRoot(() => query({ queryKey: ['products'], queryFn }, client));
    await Promise.resolve();

    expect(queryFn).not.toHaveBeenCalled();
    expect(client.getQuery({ queryKey: ['products'], queryFn }).state.status).toBe('pending');
  });

  it('resolves the awaited entry when its chunk lands, without a request', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => ['fetched']);

    client.expect(['["products"]']);
    const handle = createRoot(() => query<string[]>({ queryKey: ['products'], queryFn }, client));

    const server = new QueryClient();

    await server.getQuery({ queryKey: ['products'], queryFn: async () => ['streamed'] }).fetch();
    client.hydrate(server.dehydrate());
    await Promise.resolve();

    expect(handle.data.value).toEqual(['streamed']);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('releases an entry whose chunk never arrived, so a broken stream still loads', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => ['fetched']);

    client.expect(['["products"]']);
    createRoot(() => query({ queryKey: ['products'], queryFn }, client));
    await Promise.resolve();
    expect(queryFn).not.toHaveBeenCalled();

    client.releaseExpected();
    await Promise.resolve();

    // The response ended without it: better a late request than a dead island.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
