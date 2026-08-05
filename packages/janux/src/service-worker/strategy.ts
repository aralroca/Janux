/**
 * The default caching strategy, as pure functions over a cache and a fetch.
 *
 * Two rules, and they point in opposite directions on purpose:
 *
 * - **Hashed build output is answered from the cache.** The name carries a
 *   content hash, so the bytes behind it can never change — asking the network
 *   about them is a round trip whose only possible answer is the one already
 *   held. This is what makes a repeat visit work with no network at all.
 * - **Everything else goes to the network first.** A document served
 *   cache-first is the classic way to strand a visitor on the deploy they first
 *   met: the HTML naming the new bundles is precisely the file that must never
 *   be stale. The cached copy is a fallback for when there is no network, not a
 *   preference.
 *
 * Nothing here touches `self` or a global cache: the worker entry supplies
 * both, which is also why every rule below is testable without a browser.
 */

/** The cache namespace. Only names starting with this are ever pruned. */
const PREFIX = 'janux-';

export interface CacheContext {
  caches: CacheStorage;
  /** Build id. It names the cache, so a new build starts from an empty one. */
  version: string;
  /** Paths precached at install and answered cache-first afterwards. */
  assets: string[];
  /** Page answered when a navigation fails with nothing cached for that URL. */
  fallback?: string;
  fetch: (request: Request) => Promise<Response>;
}

export function cacheName(version: string): string {
  return `${PREFIX}${version}`;
}

/** Same-origin GETs. A POST has no cache semantics, and another origin is not ours to serve. */
export function handles(request: Request, origin: string): boolean {
  return request.method === 'GET' && new URL(request.url).origin === origin;
}

/**
 * All of the assets or none of them: `addAll` rejects if any request fails, and
 * a rejected install leaves the previous worker in charge. A worker that
 * activated with half a manifest would claim offline support it cannot honour.
 */
export async function precache(ctx: CacheContext): Promise<void> {
  const cache = await ctx.caches.open(cacheName(ctx.version));

  await cache.addAll(ctx.assets);
}

/** Every Janux cache but this version's. An app's own caches are not ours to delete. */
export async function prune(ctx: CacheContext): Promise<void> {
  const keep = cacheName(ctx.version);
  const stale = (await ctx.caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== keep);

  await Promise.all(stale.map((name) => ctx.caches.delete(name)));
}

/**
 * What may be kept. An error is a moment in time rather than the page; an
 * opaque response has a status of 0, so storing it would cache a failure
 * indistinguishable from success; and `no-store` is the one instruction a
 * server can give about this exact question.
 *
 * `redirected` is the subtle one: a response that followed a redirect cannot be
 * handed back for a navigation — the browser refuses it — so caching one would
 * produce a page that works online and throws the moment the network is gone.
 */
function storable(response: Response): boolean {
  if (response.status !== 200 || response.redirected || response.type === 'opaque') return false;

  return !(response.headers.get('cache-control') ?? '').includes('no-store');
}

async function fromNetwork(request: Request, cache: Cache, ctx: CacheContext): Promise<Response> {
  const response = await ctx.fetch(request);

  if (storable(response)) await cache.put(request, response.clone());

  return response;
}

/** Cached bytes, or the network for an asset the install never reached (and then kept). */
async function cacheFirst(request: Request, path: string, cache: Cache, ctx: CacheContext): Promise<Response> {
  return (await cache.match(path)) ?? (await fromNetwork(request, cache, ctx));
}

/** The offline answer for a page never visited: the fallback document, and only for a navigation. */
async function fallbackFor(request: Request, cache: Cache, ctx: CacheContext): Promise<Response | undefined> {
  if (request.mode !== 'navigate' || !ctx.fallback) return undefined;

  return cache.match(ctx.fallback);
}

async function networkFirst(request: Request, cache: Cache, ctx: CacheContext): Promise<Response> {
  try {
    return await fromNetwork(request, cache, ctx);
  } catch (error) {
    const cached = (await cache.match(request)) ?? (await fallbackFor(request, cache, ctx));

    // Rethrown rather than turned into a synthetic 5xx: the browser's own
    // offline page says it better than anything this worker could invent.
    if (!cached) throw error;

    return cached;
  }
}

export async function respond(request: Request, ctx: CacheContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const cache = await ctx.caches.open(cacheName(ctx.version));

  if (ctx.assets.includes(pathname)) return cacheFirst(request, pathname, cache, ctx);

  return networkFirst(request, cache, ctx);
}
