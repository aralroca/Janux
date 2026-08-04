import { afterEach, describe, expect, it } from 'bun:test';
import { defineConfig } from 'janux';
import { assets, version } from 'janux/service-worker';
import { docExample } from '../doc-example';

/**
 * guide/service-workers.md and reference/service-worker.md both make claims a
 * reader will act on: that the three-line `src/sw.ts` is the whole worker, that
 * `assets`/`version` are safe to import outside a build, and that a hand-written
 * worker can use the same manifest. Each is executed here against a stand-in
 * service worker scope, so prose that stops being true fails the suite.
 */

const ORIGIN = 'https://app.test';
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');

afterEach(() => {
  if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf);
  if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
  else delete (globalThis as { caches?: unknown }).caches;
});

/** Enough `ServiceWorkerGlobalScope` to let a documented worker install itself. */
function scopeStub() {
  const listeners = new Map<string, (event: any) => void>();
  const store = new Map<string, Set<string>>();
  const caches = {
    open: async (name: string) => {
      const held = store.get(name) ?? new Set<string>();

      store.set(name, held);

      return {
        addAll: async (urls: string[]) => urls.forEach((url) => held.add(url)),
        add: async (url: string) => held.add(url),
        match: async () => undefined,
        put: async () => {},
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const scope = {
    caches,
    store,
    location: { origin: ORIGIN },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting: async () => {},
    fetch: async () => new Response('bytes'),
    addEventListener: (type: string, handler: (event: any) => void) => listeners.set(type, handler),
  };

  // Both, because both are real in a worker: `offlineFirst()` reads its scope
  // off `self`, and a hand-written worker reaches for the bare global `caches`.
  Object.defineProperty(globalThis, 'self', { value: scope, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'caches', { value: caches, configurable: true, writable: true });

  return { scope, listeners };
}

/** Runs a lifecycle handler the way the browser does, awaiting its `waitUntil`. */
async function fire(listeners: Map<string, (event: any) => void>, type: string): Promise<void> {
  const waited: Promise<unknown>[] = [];

  listeners.get(type)?.({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) });
  await Promise.all(waited);
}

describe('reference/service-worker.md', () => {
  it('the manifest is importable outside a build, exactly as the page says', () => {
    expect(assets).toEqual([]);
    expect(version).toBe('dev');
  });

  it('the documented `src/sw.ts` installs a worker that precaches the fallback', async () => {
    const { scope, listeners } = scopeStub();

    await docExample('apps/docs/content/reference/service-worker.md', 2);
    await fire(listeners, 'install');

    expect([...listeners.keys()].sort()).toEqual(['activate', 'fetch', 'install']);
    expect([...scope.store.get('janux-dev')!]).toEqual(['/offline']);
  });

  it('the hand-written worker on the page installs against the same manifest', async () => {
    const { scope, listeners } = scopeStub();

    await docExample('apps/docs/content/reference/service-worker.md', 5);
    await fire(listeners, 'install');
    await fire(listeners, 'activate');

    expect([...scope.store.keys()]).toEqual(['my-app-dev']);
  });

  it('`register: false` is a real config, not a documented intention', () => {
    expect(defineConfig({ serviceWorker: { register: false } }).serviceWorker).toEqual({ register: false });
  });
});

describe('guide/service-workers.md', () => {
  it('the guide opens with a worker that is genuinely the whole file', async () => {
    const { listeners } = scopeStub();

    await docExample('apps/docs/content/guide/service-workers.md', 0);

    expect([...listeners.keys()].sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it('the "write your own" snippet compiles and installs on its own terms', async () => {
    const { scope, listeners } = scopeStub();

    await docExample('apps/docs/content/guide/service-workers.md', 4);
    await fire(listeners, 'install');

    expect([...scope.store.keys()]).toEqual(['my-app-dev']);
  });
});
