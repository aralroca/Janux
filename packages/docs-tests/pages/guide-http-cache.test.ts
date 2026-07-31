import { beforeAll, describe, expect, it } from 'bun:test';
import { cacheHeaders, cachePolicy } from 'janux';
import { QueryClient } from 'janux/query';
import { docExample } from '../doc-example';

/**
 * guide/http-cache.md claims exact header lines. Those are the claims worth
 * running: a policy the page shows is fed through the real emitter, and the
 * output is compared with the block of headers the prose promises — so the
 * documented directives cannot drift from the ones the framework writes.
 */

let productPolicy: any;
let accountPolicy: any;

beforeAll(async () => {
  ({ cache: productPolicy } = await docExample('apps/docs/content/guide/http-cache.md', 0));
  // A one-line fence shows the opt-out without repeating the import above it.
  ({ cache: accountPolicy } = await docExample('apps/docs/content/guide/http-cache.md', 1, {
    'export const cache =': "import { cachePolicy } from 'janux';\nexport const cache =",
  }));
});

describe('guide/http-cache.md', () => {
  it('emits exactly the header block the page prints for the product route', () => {
    const headers = cacheHeaders(productPolicy, { params: { id: '42' }, vary: ['x-janux-navigation'] });

    expect(headers['cache-control']).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    expect(headers['cache-tag']).toBe('catalog, product:42');
    expect(headers.vary).toBe('x-janux-navigation');
  });

  it('answers the fail-safe for a route that declares nothing', () => {
    expect(cacheHeaders(undefined)).toEqual({ 'cache-control': 'private, no-store' });
  });

  it('gives the bfcache opt-out the page documents: private, but storable', () => {
    expect(cacheHeaders(accountPolicy)['cache-control']).toBe('private, max-age=0');
  });

  it('refuses a shared-cache directive on a private policy, as the page says it does', () => {
    expect(() => cachePolicy({ name: 'oops', sharedMaxAge: '5m' })).toThrow(/private/);
  });

  it('writes Fastly tags the way the CDN table promises', () => {
    const headers = cacheHeaders(productPolicy, { params: { id: '42' }, tagHeader: 'Surrogate-Key' });

    expect(headers['surrogate-key']).toBe('catalog product:42');
  });

  it('runs the client table: fresh, then stale-but-shown, then expired', async () => {
    let clock = 0;
    const client = new QueryClient(() => clock);
    const options = { queryKey: ['products'], queryFn: async () => ['a'], staleTime: 30_000, swr: 300_000 };

    await client.getQuery(options).fetch();
    expect(client.getQuery(options).isStale()).toBe(false);

    clock = 60_000;
    expect(client.getQuery(options).isStale()).toBe(true);
    expect(client.getQuery(options).visible().data).toEqual(['a']);

    clock = 330_001;
    expect(client.getQuery(options).visible().status).toBe('pending');
  });

  it('drops both halves of the cache with the one tag word', async () => {
    const client = new QueryClient();
    let calls = 0;

    await client.getQuery({ queryKey: ['products'], queryFn: async () => ++calls, tags: ['catalog'] }).fetch();
    await client.invalidateTag('catalog');

    expect(calls).toBe(2);
  });
});
