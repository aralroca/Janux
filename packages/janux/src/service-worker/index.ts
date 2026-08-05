/**
 * `janux/service-worker` — what an app's `src/sw.ts` imports.
 *
 * The file is the opt-in: no `src/sw.ts`, no worker, not a byte of this in the
 * output. When it exists, `janux build` bundles it to `/sw.js` with the asset
 * manifest of that build substituted in, which is the piece a worker cannot
 * compute for itself — the bundler is the only thing that knows what the
 * hashed filenames turned out to be.
 *
 * ```ts
 * // src/sw.ts — the whole default
 * import { offlineFirst } from 'janux/service-worker';
 *
 * offlineFirst({ fallback: '/offline' });
 * ```
 *
 * Or take the manifest and write the worker yourself: `assets` and `version`
 * are the only things you needed the build for, and every handler below is an
 * ordinary listener you can replace.
 */
import { cacheName, handles, precache, prune, respond, type CacheContext } from './strategy';

/**
 * Substituted by the build (`@janux/vite`) as a literal. Read through `typeof`
 * so the module still imports in a unit test, in dev, or anywhere the
 * substitution never happened.
 */
declare const __JANUX_SW_BUILD__: { assets: string[]; version: string };

const build = typeof __JANUX_SW_BUILD__ === 'undefined' ? { assets: [], version: 'dev' } : __JANUX_SW_BUILD__;

/** Every hashed bundle, stylesheet, font, image variant and `public/` file of this build. */
export const assets: string[] = build.assets;

/**
 * This build's id: a hash of the emitted bytes, so it changes when — and only
 * when — the output does. It names the cache, which is what makes a deploy
 * start from a clean one and the previous deploy's caches collectable.
 */
export const version: string = build.version;

export interface OfflineOptions {
  /** Paths to precache. Defaults to this build's `assets`. */
  assets?: string[];
  /**
   * Page to answer with when a navigation fails offline and nothing is cached
   * for that URL. Precache it (it is in `public/`, so `assets` already covers
   * it) or the fallback has nothing to serve.
   */
  fallback?: string;
}

/** The subset of `ServiceWorkerGlobalScope` used here, so the module type-checks without DOM libs. */
interface WorkerScope {
  caches: CacheStorage;
  location: { origin: string };
  clients: { claim(): Promise<void>; matchAll(options: { type: 'window' }): Promise<{ url: string }[]> };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: string, handler: (event: any) => void): void;
}

/**
 * Install the default strategy: precache on install, prune on activate,
 * cache-first for build assets and network-first for everything else.
 *
 * `skipWaiting()` and `clients.claim()` are the interesting half. Without them
 * a new worker sits in `waiting` until every tab running the old one is gone,
 * which on a site people leave open means a deploy nobody receives. With them
 * the new build takes over as soon as it has finished precaching — and the page
 * that was open reloads once, because `registerServiceWorker` listens for the
 * controller change.
 */
export function offlineFirst(options: OfflineOptions = {}): void {
  const scope = self as unknown as WorkerScope;
  const declared = options.assets ?? assets;
  const ctx: CacheContext = {
    caches: scope.caches,
    version,
    // The fallback joins the precache list rather than the asset list: it is a
    // page, pages are answered network-first, and a fallback fetched on demand
    // is a fallback that is missing exactly when it is wanted.
    assets: options.fallback ? [...declared, options.fallback] : declared,
    fallback: options.fallback,
    // `self.fetch`, not the bare global: inside a worker they are the same
    // function, and reading it off the scope is what lets this be tested.
    fetch: (request) => scope.fetch(request),
  };

  scope.addEventListener('install', (event) => event.waitUntil(install(scope, ctx)));
  scope.addEventListener('activate', (event) => event.waitUntil(activate(scope, ctx)));
  scope.addEventListener('fetch', (event) => {
    if (handles(event.request, scope.location.origin)) event.respondWith(respond(event.request, ctx));
  });
}

async function install(scope: WorkerScope, ctx: CacheContext): Promise<void> {
  await precache(ctx);
  await scope.skipWaiting();
}

async function activate(scope: WorkerScope, ctx: CacheContext): Promise<void> {
  await prune(ctx);
  await scope.clients.claim();
  await warmOpenPages(scope, ctx);
}

/**
 * Cache the pages that are open right now.
 *
 * The page that installed this worker was downloaded before there was a worker
 * to answer for it, so nothing put it in the cache: without this, an app is
 * offline-capable everywhere except the page the visitor is currently reading,
 * and "works offline after the first visit" quietly means "after the second".
 *
 * `allSettled` because activation must not depend on it — a page that has since
 * become unfetchable is a reason to skip one URL, never to leave the previous
 * worker in charge.
 */
async function warmOpenPages(scope: WorkerScope, ctx: CacheContext): Promise<void> {
  const open = await scope.clients.matchAll({ type: 'window' });
  const cache = await ctx.caches.open(cacheName(ctx.version));

  await Promise.allSettled(open.map((client) => cache.add(client.url)));
}
