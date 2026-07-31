import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import {
  configurePrefetch,
  consumePrefetched,
  consumeWarmManifest,
  prefetch,
  prefetchOnHover,
} from './prefetch';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost/' }));
afterAll(() => GlobalRegistrator.unregister());

const streamOf = (html: string) => new Response(html).body!;

function mockFetch(): ReturnType<typeof mock> {
  const fetched = mock(async (url: string) => new Response(`<p>${url}</p>`));

  (globalThis as any).fetch = fetched;

  return fetched;
}

/** The shell advertises a route manifest; without the link there is nothing to warm. */
function withManifestLink(): void {
  document.head.innerHTML = '<link rel="janux-manifest" id="jx-manifest" href="/_janux/manifest">';
}

afterEach(() => {
  document.head.innerHTML = '';
  configurePrefetch(undefined);
});

describe('prefetch cache', () => {
  it('serves the warmed stream once, then forgets it', async () => {
    const fetched = mockFetch();

    prefetch('/a');
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(await consumePrefetched('/a')).toBeDefined();
    // A second navigation to the same URL must go to the network again: the
    // stream was already consumed by the first one.
    expect(consumePrefetched('/a')).toBeUndefined();
  });

  it('does not warm the same URL twice while the entry is fresh', () => {
    const fetched = mockFetch();

    prefetch('/a');
    prefetch('/a');

    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it('drops an entry older than the TTL', async () => {
    mockFetch();
    configurePrefetch({ ttl: 0 });
    prefetch('/stale');
    await Bun.sleep(1);

    expect(consumePrefetched('/stale')).toBeUndefined();
  });

  it('forgets an entry whose fetch failed, so the navigation refetches', async () => {
    (globalThis as any).fetch = mock(async () => ({ ok: false, status: 500 }));
    prefetch('/broken');
    await Bun.sleep(1);

    expect(consumePrefetched('/broken')).toBeUndefined();
  });

  /** The `_404` page is a page: a warmed one must survive to be diffed in. */
  it('keeps a warmed error document, and drops a bodyless failure', async () => {
    (globalThis as any).fetch = mock(async () =>
      new Response('<p>gone</p>', { status: 404, headers: { 'content-type': 'text/html' } }),
    );
    prefetch('/gone');
    await Bun.sleep(1);

    expect(await consumePrefetched('/gone')).toBeDefined();
  });

  /** Prefetching spends someone's data plan on a page they may never open. */
  it('does nothing when the user asked to save data', () => {
    const fetched = mockFetch();
    const connection = { saveData: true };

    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    prefetch('/a');

    expect(fetched).not.toHaveBeenCalled();
    expect(consumePrefetched('/a')).toBeUndefined();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
  });

  /** A hover tour over a long nav must not pile up open connections. */
  it('caps warmed pages, cancelling the oldest body when a new one comes in', async () => {
    const cancelled: string[] = [];

    (globalThis as any).fetch = mock(async (url: string) => ({
      ok: true,
      headers: new Headers(),
      body: new ReadableStream({
        cancel() {
          cancelled.push(url);
        },
      }),
    }));
    for (let index = 0; index < 9; index += 1) prefetch(`/page-${index}`);
    await Bun.sleep(1);

    expect(cancelled).toEqual(['/page-0']);
    // Newest first: consuming a page also ends every other warm-up.
    expect(await consumePrefetched('/page-8')).toBeDefined();
    expect(consumePrefetched('/page-0')).toBeUndefined();
  });
});

describe('bandwidth for the page being opened', () => {
  /**
   * The one the user clicked cannot be promoted — it started life as a
   * low-priority prefetch — so the pages merely passed over are stopped instead.
   */
  it('aborts every warm-up for somewhere else when a navigation starts', async () => {
    const fetched = mockFetch();

    prefetch('/wanted');
    prefetch('/passed-over');
    await Bun.sleep(1);
    const signals = fetched.mock.calls.map(([, init]: any[]) => init.signal);

    consumePrefetched('/wanted');

    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(true);
    expect(consumePrefetched('/passed-over')).toBeUndefined();
  });

  it('warms below the page the user is actually on', () => {
    const fetched = mockFetch();

    prefetch('/a');

    expect(fetched.mock.calls[0][1]).toMatchObject({ priority: 'low' });
  });
});

describe('hover intent', () => {
  /** Ten links crossed on the way down a menu are ten pages fighting over the wire. */
  it('warms only the link the pointer settles on', async () => {
    const fetched = mockFetch();

    ['/one', '/two', '/three'].forEach(prefetchOnHover);
    await Bun.sleep(120);

    expect(fetched.mock.calls.map(([url]: any[]) => url)).toEqual(['/three']);
  });

  /** A link is one target even when the pointer crosses the icon and the label inside it. */
  it('keeps counting down when the pointer moves within the same link', async () => {
    const fetched = mockFetch();

    prefetchOnHover('/same');
    await Bun.sleep(40);
    prefetchOnHover('/same');
    // 80ms in total: only a countdown that never restarted has fired by now.
    await Bun.sleep(40);

    expect(fetched).toHaveBeenCalledTimes(1);
  });

  /** Reconfiguring drops warmed pages; a hover still in its delay must go with them. */
  it('drops a pending hover when prefetching is reconfigured', async () => {
    const fetched = mockFetch();

    prefetchOnHover('/crossed');
    await Bun.sleep(10);
    configurePrefetch(undefined);
    await Bun.sleep(120);

    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('route manifest', () => {
  it('warms the destination manifest with the page, and serves it once', async () => {
    const fetched = mockFetch();

    withManifestLink();
    prefetch('/docs/guide');
    await Bun.sleep(1);

    expect(fetched.mock.calls.map(([url]: any[]) => url)).toEqual([
      '/docs/guide',
      '/_janux/manifest?path=%2Fdocs%2Fguide',
    ]);
    expect(await consumeWarmManifest('/docs/guide')).toBeDefined();
    expect(consumeWarmManifest('/docs/guide')).toBeUndefined();
  });

  /** The destination's manifest is part of the navigation, not competition for it. */
  it('keeps the manifest when the navigation it belongs to starts', async () => {
    mockFetch();
    withManifestLink();
    prefetch('/docs/guide');
    prefetch('/elsewhere');
    await Bun.sleep(1);

    consumePrefetched('/docs/guide');

    expect(await consumeWarmManifest('/docs/guide')).toBeDefined();
  });

  /** A static export serves no `/_janux/*`, and says so by omitting the link. */
  it('asks for nothing when the shell advertises no manifest', async () => {
    const fetched = mockFetch();

    prefetch('/docs/guide');
    await Bun.sleep(1);

    expect(fetched.mock.calls.map(([url]: any[]) => url)).toEqual(['/docs/guide']);
    expect(consumeWarmManifest('/docs/guide')).toBeUndefined();
  });
});
