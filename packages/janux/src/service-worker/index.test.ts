import { afterEach, describe, expect, it } from 'bun:test';
import { FakeCacheStorage, ORIGIN, request } from './__fixtures__/cache-storage';
import { assets, offlineFirst, version } from './index';
import { cacheName } from './strategy';

/**
 * `offlineFirst()` is the one line an app writes in `src/sw.ts`, so what it
 * wires up is the contract — above all the lifecycle half, which is where a
 * service worker traps its users:
 *
 * By default a new worker installs and then WAITS, taking over only once every
 * tab of the old one has closed. On a site people keep open that is never, so a
 * deploy lands and nobody sees it. `skipWaiting()` + `clients.claim()` says the
 * opposite: the new build takes over the moment it is ready, and the old
 * version's caches go with it.
 */

const original = Object.getOwnPropertyDescriptor(globalThis, 'self');

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'self', original);
});

interface Handled {
  waited: Promise<unknown>[];
  responded: Promise<Response>[];
}

function fakeScope(fetch: (req: Request) => Promise<Response>) {
  const handlers = new Map<string, (event: any) => void>();
  const calls = { skipWaiting: 0, claim: 0 };
  const scope = {
    caches: new FakeCacheStorage(fetch),
    location: new URL(`${ORIGIN}/sw.js`),
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
      matchAll: async () => [{ url: `${ORIGIN}/here` }],
    },
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    fetch,
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
  };

  Object.defineProperty(globalThis, 'self', { value: scope, configurable: true, writable: true });

  return { scope, calls, handlers };
}

/** Fires a lifecycle event and awaits whatever the handler passed to `waitUntil`. */
async function fire(handlers: Map<string, (event: any) => void>, type: string, extra: object = {}): Promise<Handled> {
  const state: Handled = { waited: [], responded: [] };

  handlers.get(type)?.({
    ...extra,
    waitUntil: (promise: Promise<unknown>) => state.waited.push(promise),
    respondWith: (promise: Promise<Response>) => state.responded.push(promise),
  });
  await Promise.all(state.waited);

  return state;
}

const serving = (body: string) => async () => new Response(body);

describe('the build manifest', () => {
  it('is empty outside a build, so importing the module never throws', () => {
    expect(assets).toEqual([]);
    expect(version).toBe('dev');
  });
});

describe('offlineFirst() lifecycle', () => {
  it('precaches on install and takes over without waiting for tabs to close', async () => {
    const { scope, calls, handlers } = fakeScope(serving('bytes'));

    offlineFirst({ assets: ['/client.js'] });
    await fire(handlers, 'install');

    expect(calls.skipWaiting).toBe(1);
    expect([...(await scope.caches.open(cacheName('dev'))).entries.keys()]).toEqual([`${ORIGIN}/client.js`]);
  });

  /**
   * The fallback is a page, and pages are deliberately absent from the build's
   * asset list — they are answered network-first. So the one page that exists
   * to be shown when there is no network has to be asked for by name, or it is
   * missing on the single occasion it was written for.
   */
  it('precaches the offline fallback, which the asset list never carries', async () => {
    const { scope, handlers } = fakeScope(serving('bytes'));

    offlineFirst({ assets: ['/client.js'], fallback: '/offline' });
    await fire(handlers, 'install');

    expect([...(await scope.caches.open(cacheName('dev'))).entries.keys()]).toEqual([
      `${ORIGIN}/client.js`,
      `${ORIGIN}/offline`,
    ]);
  });

  it('prunes older versions and claims open pages on activate', async () => {
    const { scope, calls, handlers } = fakeScope(serving('bytes'));

    offlineFirst();
    await scope.caches.open('janux-old');
    await fire(handlers, 'activate');

    expect(calls.claim).toBe(1);
    expect(await scope.caches.keys()).toEqual(['janux-dev']);
  });

  /**
   * The page that installed the worker was fetched BEFORE there was a worker to
   * fetch it, so nothing cached it. Without this, an app is offline-capable
   * everywhere except the one page the visitor is actually looking at, and
   * "works offline after the first visit" would quietly mean "after the
   * second". Warming the open pages on activate is what makes the claim true.
   */
  it('caches the pages already open, which installed the worker before it existed', async () => {
    const { scope, handlers } = fakeScope(serving('the page'));

    offlineFirst({ assets: [] });
    await fire(handlers, 'activate');

    expect([...(await scope.caches.open(cacheName('dev'))).entries.keys()]).toEqual([`${ORIGIN}/here`]);
  });

  it('activates anyway when a page that was open can no longer be fetched', async () => {
    const { calls, handlers } = fakeScope(async () => {
      throw new TypeError('Failed to fetch');
    });

    offlineFirst({ assets: [] });
    await fire(handlers, 'activate');

    expect(calls.claim).toBe(1);
  });
});

describe('offlineFirst() fetch handling', () => {
  it('answers same-origin GETs', async () => {
    const { handlers } = fakeScope(serving('page'));

    offlineFirst();
    const { responded } = await fire(handlers, 'fetch', { request: request('/') });

    expect(await (await responded[0]!).text()).toBe('page');
  });

  it('leaves cross-origin and non-GET requests to the browser', async () => {
    const { handlers } = fakeScope(serving('page'));

    offlineFirst();

    expect((await fire(handlers, 'fetch', { request: new Request('https://cdn.other/a') })).responded).toEqual([]);
    expect((await fire(handlers, 'fetch', { request: request('/x', { method: 'POST' }) })).responded).toEqual([]);
  });
});
