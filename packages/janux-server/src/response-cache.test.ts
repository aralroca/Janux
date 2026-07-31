import { beforeEach, describe, expect, it } from 'bun:test';
import { createResponseCache, revalidatePath, revalidateTag } from './response-cache';

let clock = 1_000_000;
const now = () => clock;

const cache = (options = {}) => createResponseCache({ now, ...options });

const req = (path = '/catalog', headers?: Record<string, string>) => new Request(`http://test${path}`, { headers });

const publicRes = (body = 'catalog', directives = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600') =>
  new Response(body, { headers: { 'cache-control': directives, 'cache-tag': 'catalog' } });

/** Counts how often the origin actually ran — the only thing a cache is for. */
function origin(make: () => Response = () => publicRes()) {
  let calls = 0;

  return { run: async () => (calls += 1, make()), get calls() { return calls; } };
}

type Store = ReturnType<typeof cache>;

/**
 * One request, the way a real one goes: the body is read (an entry commits only
 * once it has been delivered — the cache never buffers ahead of the client) and
 * background work is allowed to settle.
 */
async function fetchThrough(store: Store, request: Request, run: () => Promise<Response>) {
  const res = await store.handle(request, run);
  const body = await res.text().catch(() => '');

  await store.idle();

  return { state: res.headers.get('x-janux-cache'), body };
}

beforeEach(() => {
  clock = 1_000_000;
  // Tags are module-level, so each test starts from "everything before now is gone".
  ['catalog', 'feed'].forEach((tag) => revalidateTag(tag));
  ['/catalog', '/feed', '/a', '/b', '/c', '/account'].forEach((path) => revalidatePath(path));
});

describe('shared response cache', () => {
  it('serves the second request without going to the origin', async () => {
    const store = cache();
    const app = origin();

    const first = await fetchThrough(store, req(), app.run);
    const second = await fetchThrough(store, req(), app.run);

    expect(first.state).toBe('MISS');
    expect(second.state).toBe('HIT');
    expect(second.body).toBe('catalog');
    expect(app.calls).toBe(1);
  });

  it('never stores a private response — that is the whole fail-safe', async () => {
    const store = cache();
    const app = origin(() => new Response('yours', { headers: { 'cache-control': 'private, no-store' } }));

    await fetchThrough(store, req('/account'), app.run);
    const second = await fetchThrough(store, req('/account'), app.run);

    expect(second.state).toBeNull();
    expect(app.calls).toBe(2);
  });

  it('never stores a response carrying a cookie, whatever it claims', async () => {
    const store = cache();
    const app = origin(
      () => new Response('hi', { headers: { 'cache-control': 'public, s-maxage=300', 'set-cookie': 'session=a' } }),
    );

    await fetchThrough(store, req(), app.run);

    expect((await fetchThrough(store, req(), app.run)).state).toBeNull();
    expect(app.calls).toBe(2);
  });

  it('never stores a non-200 — an error is not the page', async () => {
    const store = cache();
    const app = origin(() => new Response('nope', { status: 500, headers: { 'cache-control': 'public, s-maxage=300' } }));

    await fetchThrough(store, req(), app.run);

    expect((await fetchThrough(store, req(), app.run)).state).toBeNull();
    expect(app.calls).toBe(2);
  });

  it('leaves anything that is not a GET alone', async () => {
    const store = cache();
    const app = origin();
    const post = () => new Request('http://test/catalog', { method: 'POST' });

    await fetchThrough(store, post(), app.run);
    await fetchThrough(store, post(), app.run);

    expect(app.calls).toBe(2);
  });

  it('serves stale inside the swr window and revalidates exactly once', async () => {
    const store = cache();
    const app = origin();

    await fetchThrough(store, req(), app.run);
    clock += 301_000;

    const stale = await store.handle(req(), app.run);
    const alsoStale = await store.handle(req(), app.run);

    expect(stale.headers.get('x-janux-cache')).toBe('STALE');
    expect(alsoStale.headers.get('x-janux-cache')).toBe('STALE');
    await Promise.all([stale.text(), alsoStale.text()]);
    await store.idle();
    // One refresh for both stale hits, not one each: a burst must not stampede.
    expect(app.calls).toBe(2);
    expect((await fetchThrough(store, req(), app.run)).state).toBe('HIT');
  });

  it('goes back to the origin once the stale window has passed too', async () => {
    const store = cache();
    const app = origin();

    await fetchThrough(store, req(), app.run);
    clock += 901_000;

    expect((await fetchThrough(store, req(), app.run)).state).toBe('MISS');
  });

  it('drops exactly the entries carrying a revalidated tag', async () => {
    const store = cache();
    const catalog = origin();
    const feed = origin(() => {
      const res = publicRes('feed');

      res.headers.set('cache-tag', 'feed');

      return res;
    });

    await fetchThrough(store, req('/catalog'), catalog.run);
    await fetchThrough(store, req('/feed'), feed.run);
    revalidateTag('catalog');

    expect((await fetchThrough(store, req('/catalog'), catalog.run)).state).toBe('MISS');
    expect((await fetchThrough(store, req('/feed'), feed.run)).state).toBe('HIT');
  });

  it('drops an entry revalidated without the clock having moved', async () => {
    const store = cache();
    const app = origin();

    // A mutation that writes and revalidates right after a page was cached lands
    // on the same `Date.now()`. Ordering by the clock loses that purge, and the
    // stale page then survives for the whole s-maxage window.
    await fetchThrough(store, req(), app.run);
    revalidateTag('catalog');

    expect((await fetchThrough(store, req(), app.run)).state).toBe('MISS');
  });

  it('re-serves the fresh copy after a revalidation, without purging it again', async () => {
    const store = cache();
    const app = origin();

    await fetchThrough(store, req(), app.run);
    revalidateTag('catalog');

    // The re-render lands in the same millisecond as the purge that caused it.
    // Ordering by the clock would drop it too, and the route would never cache.
    expect((await fetchThrough(store, req(), app.run)).state).toBe('MISS');
    expect((await fetchThrough(store, req(), app.run)).state).toBe('HIT');
    expect(app.calls).toBe(2);
  });

  it('drops an entry by path', async () => {
    const store = cache();
    const app = origin();

    await fetchThrough(store, req(), app.run);
    revalidatePath('/catalog');

    expect((await fetchThrough(store, req(), app.run)).state).toBe('MISS');
  });

  it('keys separately on the headers the response says it varies on', async () => {
    const store = cache();
    const app = origin(() => {
      const res = publicRes();

      res.headers.set('vary', 'x-janux-navigation');

      return res;
    });

    await fetchThrough(store, req('/catalog'), app.run);
    const navigation = await fetchThrough(store, req('/catalog', { 'x-janux-navigation': '1' }), app.run);

    // The SPA body is a different body; sharing one entry would serve it cold.
    expect(navigation.state).toBe('MISS');
    expect(app.calls).toBe(2);
    expect((await fetchThrough(store, req('/catalog'), app.run)).state).toBe('HIT');
  });

  it('never stores a Vary: * response — there is no key that could be right', async () => {
    const store = cache();
    const app = origin(() => {
      const res = publicRes();

      res.headers.set('vary', '*');

      return res;
    });

    await fetchThrough(store, req(), app.run);

    expect((await fetchThrough(store, req(), app.run)).state).toBeNull();
    expect(app.calls).toBe(2);
  });

  it('does not commit a body whose stream failed halfway', async () => {
    const store = cache();
    const broken = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('half'));
            controller.error(new Error('boom'));
          },
        }),
        { headers: { 'cache-control': 'public, s-maxage=300' } },
      );

    await fetchThrough(store, req(), async () => broken());

    expect((await fetchThrough(store, req(), async () => publicRes())).state).toBe('MISS');
  });

  it('refuses to grow without bound', async () => {
    const store = cache({ maxEntries: 2 });
    const app = origin();

    await fetchThrough(store, req('/a'), app.run);
    await fetchThrough(store, req('/b'), app.run);
    await fetchThrough(store, req('/c'), app.run);

    // The oldest went out to make room, so it costs an origin call again.
    expect((await fetchThrough(store, req('/a'), app.run)).state).toBe('MISS');
    expect((await fetchThrough(store, req('/c'), app.run)).state).toBe('HIT');
  });

  it('skips a body too large to be worth holding', async () => {
    const store = cache({ maxBytes: 8 });
    const app = origin(() => publicRes('far too long to keep'));

    await fetchThrough(store, req(), app.run);

    expect((await fetchThrough(store, req(), app.run)).state).toBe('MISS');
  });
});
