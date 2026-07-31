import { describe, expect, it, mock } from 'bun:test';
import { QueryClient } from './cache';

/**
 * The client half of one cache model. A route says `sharedMaxAge`/`swr` to a
 * CDN; a query says `staleTime`/`swr` to the browser — the same three states
 * (fresh, stale-but-showable, too old to show) with the same arithmetic, so
 * there is one thing to learn rather than two.
 */
describe('query staleTime + swr', () => {
  const clocked = () => {
    let now = 0;

    return { client: new QueryClient(() => now), at: (value: number) => (now = value) };
  };

  it('shows stale data while it revalidates, instead of blanking the screen', async () => {
    const { client, at } = clocked();
    let count = 0;
    const options = { queryKey: ['k'], queryFn: async () => ++count, staleTime: 1000, swr: 10_000 };

    await client.getQuery(options).fetch();
    at(5000);

    const entry = client.getQuery(options);

    expect(entry.isStale()).toBe(true);
    expect(entry.isExpired()).toBe(false);
    // Past staleTime the value is still worth showing — that is what swr buys.
    expect(entry.visible().status).toBe('success');
    expect(entry.visible().data).toBe(1);
  });

  it('stops showing data once it is older than staleTime + swr', async () => {
    const { client, at } = clocked();
    const options = { queryKey: ['k'], queryFn: async () => 'v', staleTime: 1000, swr: 10_000 };

    await client.getQuery(options).fetch();
    at(11_001);

    const entry = client.getQuery(options);

    expect(entry.isExpired()).toBe(true);
    expect(entry.visible().status).toBe('pending');
    expect(entry.visible().data).toBeUndefined();
  });

  it('keeps data forever when no swr window is declared — today\'s behaviour, unchanged', async () => {
    const { client, at } = clocked();
    const options = { queryKey: ['k'], queryFn: async () => 'v', staleTime: 1000 };

    await client.getQuery(options).fetch();
    at(10_000_000);

    expect(client.getQuery(options).isExpired()).toBe(false);
    expect(client.getQuery(options).visible().data).toBe('v');
  });

  it('hides expired data from getQueryData too — one answer, not two', async () => {
    const { client, at } = clocked();
    const options = { queryKey: ['k'], queryFn: async () => 'v', staleTime: 0, swr: 1000 };

    await client.getQuery(options).fetch();
    at(2000);

    expect(client.getQueryData(['k'])).toBeUndefined();
  });

  it('counts the swr window from when the data landed, not from when it was asked for', async () => {
    const { client, at } = clocked();

    at(1000);
    const options = { queryKey: ['k'], queryFn: async () => 'v', staleTime: 1000, swr: 1000 };

    await client.getQuery(options).fetch();
    at(2500);
    expect(client.getQuery(options).isExpired()).toBe(false);
    at(3001);
    expect(client.getQuery(options).isExpired()).toBe(true);
  });
});

describe('query tags', () => {
  it('refetches every query carrying the revalidated tag, and only those', async () => {
    const client = new QueryClient();
    const products = mock(async () => 'products');
    const orders = mock(async () => 'orders');

    const a = client.getQuery({ queryKey: ['products'], queryFn: products, tags: ['catalog'] });
    const b = client.getQuery({ queryKey: ['orders'], queryFn: orders, tags: ['account'] });

    await Promise.all([a.fetch(), b.fetch()]);
    await client.invalidateTag('catalog');

    expect(products).toHaveBeenCalledTimes(2);
    expect(orders).toHaveBeenCalledTimes(1);
  });

  it('uses the same tag word the route policy does, so a mutation can purge both halves', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => 'v');

    await client.getQuery({ queryKey: ['p', 1], queryFn, tags: ['product:1', 'catalog'] }).fetch();
    await client.invalidateTag('product:1');

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('leaves untagged queries alone', async () => {
    const client = new QueryClient();
    const queryFn = mock(async () => 'v');

    await client.getQuery({ queryKey: ['k'], queryFn }).fetch();
    await client.invalidateTag('catalog');

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
