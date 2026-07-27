import { afterEach, describe, expect, it, mock } from 'bun:test';
import { configurePrefetch, consumePrefetched, prefetch } from './prefetch';

const streamOf = (html: string) => new Response(html).body!;

function mockFetch(): ReturnType<typeof mock> {
  const fetched = mock(async (url: string) => ({ ok: true, body: streamOf(`<p>${url}</p>`) }));

  (globalThis as any).fetch = fetched;

  return fetched;
}

afterEach(() => configurePrefetch(undefined));

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

  it('does nothing when prefetching is turned off in the config', () => {
    const fetched = mockFetch();

    configurePrefetch({ enabled: false });
    prefetch('/a');

    expect(fetched).not.toHaveBeenCalled();
  });
});
