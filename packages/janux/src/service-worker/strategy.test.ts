import { describe, expect, it } from 'bun:test';
import { FakeCacheStorage, ORIGIN, request } from './__fixtures__/cache-storage';
import { cacheName, handles, precache, prune, respond, type CacheContext } from './strategy';

/**
 * The default strategy, stated as behaviour rather than as code shape.
 *
 * The two claims worth guarding are opposites, which is why they are separate
 * tests: a hashed asset must come from the cache even when the network is up
 * (that is the offline promise), and a document must come from the NETWORK even
 * when a copy is cached (that is the update promise — the classic failure is an
 * HTML shell served cache-first, which pins every visitor to the deploy they
 * first met).
 */

const ASSETS = ['/client.js', '/assets/app-a1b2c3d4.css'];

/** The context the strategy takes, plus `fake` — the same storage, typed so a test can read inside it. */
function context(
  fetch: (req: Request) => Promise<Response>,
  overrides: Partial<CacheContext> = {},
): CacheContext & { fake: FakeCacheStorage } {
  const fake = new FakeCacheStorage(fetch);

  return { caches: fake as unknown as CacheStorage, fake, version: 'v1', assets: ASSETS, fetch, ...overrides };
}

const serving = (body: string, init?: ResponseInit) => async () => new Response(body, init);
const offline = async () => {
  throw new TypeError('Failed to fetch');
};

describe('service worker cache naming', () => {
  it('namespaces the cache by version so a new build never reuses old bytes', () => {
    expect(cacheName('abc123')).toBe('janux-abc123');
    expect(cacheName('abc123')).not.toBe(cacheName('def456'));
  });
});

describe('which requests the worker takes over', () => {
  it('handles same-origin GETs only', () => {
    expect(handles(request('/'), ORIGIN)).toBe(true);
    expect(handles(request('/x', { method: 'POST' }), ORIGIN)).toBe(false);
    expect(handles(new Request('https://cdn.other/x'), ORIGIN)).toBe(false);
  });
});

describe('install', () => {
  it('precaches every declared asset', async () => {
    const ctx = context(serving('bytes'));

    await precache(ctx);

    expect([...(await ctx.fake.open(cacheName('v1'))).entries.keys()]).toEqual(ASSETS.map((path) => `${ORIGIN}${path}`));
  });

  it('fails the install when an asset is missing, rather than claiming a broken offline app', async () => {
    const ctx = context(serving('nope', { status: 404 }));

    expect(precache(ctx)).rejects.toThrow();
  });
});

describe('activate', () => {
  it('deletes the caches of previous versions and keeps this one', async () => {
    const ctx = context(serving('bytes'));

    await ctx.fake.open('janux-v0');
    await ctx.fake.open('janux-v1');

    await prune(ctx);

    expect(await ctx.fake.keys()).toEqual(['janux-v1']);
  });

  it("leaves caches the app owns alone: only Janux's own namespace is pruned", async () => {
    const ctx = context(serving('bytes'));

    await ctx.fake.open('my-app-images');
    await ctx.fake.open('janux-v0');

    await prune(ctx);

    expect(await ctx.fake.keys()).toEqual(['my-app-images']);
  });
});

describe('fetch: precached assets', () => {
  it('answers from the cache without touching the network', async () => {
    const ctx = context(serving('built'));

    await precache(ctx);
    const response = await respond(request('/client.js'), { ...ctx, fetch: offline });

    expect(await response.text()).toBe('built');
  });

  it('falls back to the network for an asset the install never reached', async () => {
    const ctx = context(serving('late'));

    expect(await (await respond(request('/client.js'), ctx)).text()).toBe('late');
  });
});

describe('fetch: documents and data', () => {
  it('goes to the network first, so a new deploy is seen immediately', async () => {
    const ctx = context(serving('old'));

    await respond(request('/'), ctx);
    const response = await respond(request('/'), { ...ctx, fetch: serving('new') });

    expect(await response.text()).toBe('new');
  });

  it('serves the last good copy when the network is gone', async () => {
    const ctx = context(serving('page'));

    await respond(request('/about'), ctx);
    const response = await respond(request('/about'), { ...ctx, fetch: offline });

    expect(await response.text()).toBe('page');
  });

  it('never stores a response the server marked no-store', async () => {
    const ctx = context(serving('secret', { headers: { 'cache-control': 'no-store' } }));

    await respond(request('/account'), ctx);

    expect(respond(request('/account'), { ...ctx, fetch: offline })).rejects.toThrow();
  });

  /**
   * A response that followed a redirect cannot be handed back for a navigation
   * — the browser throws rather than render it — so a cached one is a page that
   * works online and fails the moment the network goes away. Never storing it
   * means the fallback answers instead, which is the whole point.
   */
  it('never stores a response that followed a redirect', async () => {
    // Built per call rather than cloned: `clone()` returns a fresh response
    // whose `redirected` is false again, which would test nothing.
    const ctx = context(async () => {
      const response = new Response('moved');

      Object.defineProperty(response, 'redirected', { value: true });

      return response;
    });

    await respond(request('/old-url'), ctx);

    expect(respond(request('/old-url'), { ...ctx, fetch: offline })).rejects.toThrow();
  });

  it('never stores an error response as if it were the page', async () => {
    const ctx = context(serving('boom', { status: 500 }));

    await respond(request('/flaky'), ctx);

    expect(respond(request('/flaky'), { ...ctx, fetch: offline })).rejects.toThrow();
  });
});

describe('fetch: the offline fallback', () => {
  it('answers an unvisited page with the fallback document', async () => {
    const ctx = context(serving('you are offline'), { fallback: '/offline' });

    await (await ctx.fake.open(cacheName('v1'))).addAll(['/offline']);
    const response = await respond(request('/never-seen', { mode: 'navigate' }), { ...ctx, fetch: offline });

    expect(await response.text()).toBe('you are offline');
  });

  /**
   * `mode` is stated rather than left to the default on purpose: it IS the
   * thing under test, and Bun's default has not been the same across the
   * supported range (1.3.0 answers `navigate`, later versions `cors`), so a
   * test that relied on it was asserting the runtime's opinion instead of the
   * strategy's. A real data request is a `fetch()` from page code.
   */
  it('does not hand the fallback page to a data request', async () => {
    const ctx = context(serving('you are offline'), { fallback: '/offline' });

    await (await ctx.fake.open(cacheName('v1'))).addAll(['/offline']);

    expect(respond(request('/api/things', { mode: 'cors' }), { ...ctx, fetch: offline })).rejects.toThrow();
  });
});
