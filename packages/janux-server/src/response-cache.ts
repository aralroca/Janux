/**
 * The shared cache Janux keeps when there is no CDN in front — and the thing
 * that makes a CDN's behaviour testable when there is.
 *
 * It reads the policy off the response's own `Cache-Control` rather than being
 * told separately, so the header a CDN obeys and the entry we keep can never
 * disagree: there is one decision (`cachePolicy`), emitted once, honoured twice.
 *
 * Invalidation follows Next's tags-manifest shape — tag → the moment it was
 * revalidated, compared against each entry's own timestamp — so a purge is O(1)
 * and there is no reverse index to keep consistent.
 */

import { concat } from './http-handlers';

export interface ResponseCacheConfig {
  /** Header tags are read from. Default `Cache-Tag`. */
  tagHeader?: string;
  /** Entries held before the least-recently-used one is dropped. */
  maxEntries?: number;
  /** Largest body worth keeping, in bytes. */
  maxBytes?: number;
  now?: () => number;
}

interface CacheEntry {
  body: Uint8Array;
  status: number;
  headers: [string, string][];
  /** Wall clock, for freshness. */
  storedAt: number;
  /** Monotonic order, for invalidation — see `sequence`. */
  stamp: number;
  tags: string[];
  path: string;
  /** Freshness and stale windows in ms, read from the response's own directives. */
  freshMs: number;
  staleMs: number;
}

const DEFAULT_TAG_HEADER = 'cache-tag';
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
/** Beyond this many distinct revalidated keys we stop tracking individually — see `invalidatedAt`. */
const MAX_TRACKED_INVALIDATIONS = 10_000;

/**
 * Invalidation is ordered by a counter, not by the clock.
 *
 * A mutation that writes and revalidates right after a page was cached lands on
 * the same `Date.now()`, and millisecond resolution cannot say which came
 * first — so a timestamp comparison either loses purges or re-purges what it
 * just stored, depending on which way the tie is broken. A monotonic sequence
 * has no ties.
 */
let sequence = 0;
const nextStamp = (): number => (sequence += 1);

/**
 * The stamp at which each tag was last revalidated (and each `path:/x` purged).
 * Module-level on purpose: `revalidateTag()` is called from an intent or an
 * `api()` handler, which have no handle on the server instance.
 *
 * Bounded, and overflowing bumps `epoch` instead of forgetting: over-purging is
 * a slow request, under-purging is stale data served forever.
 */
const invalidatedAt = new Map<string, number>();
let epoch = 0;

function mark(key: string): void {
  const at = nextStamp();

  if (invalidatedAt.size >= MAX_TRACKED_INVALIDATIONS) {
    invalidatedAt.clear();
    epoch = at;
  }
  invalidatedAt.set(key, at);
}

/** Drops every cached response carrying `tag`, here and (via the tag header) at the CDN. */
export function revalidateTag(tag: string): void {
  mark(tag);
}

/** Drops the cached response for exactly this path. */
export function revalidatePath(path: string): void {
  mark(`path:${path}`);
}

const directive = (control: string, name: string): number | undefined => {
  const match = new RegExp(`(?:^|,)\\s*${name}=(\\d+)`).exec(control);

  return match ? Number(match[1]) * 1000 : undefined;
};

/**
 * What the response tells a shared cache it may do. `private`, `no-store` and
 * absent directives all mean "not yours to keep" — the default direction of
 * every ambiguity here is towards not storing.
 */
function shareable(res: Response): { freshMs: number; staleMs: number } | undefined {
  const control = res.headers.get('cache-control') ?? '';

  if (res.status !== 200) return undefined;
  if (res.headers.has('set-cookie')) return undefined;
  // `Vary: *` means "no two requests are equivalent" — there is no key to build.
  if (res.headers.get('vary')?.split(',').some((name) => name.trim() === '*')) return undefined;
  if (!/(?:^|,)\s*public\b/.test(control) || /no-store/.test(control)) return undefined;
  const freshMs = directive(control, 's-maxage') ?? directive(control, 'max-age') ?? 0;

  if (freshMs <= 0) return undefined;

  return { freshMs, staleMs: directive(control, 'stale-while-revalidate') ?? 0 };
}

/** Same URL, same body — unless the response says it varies, in which case those values join the key. */
function keyFor(req: Request, url: URL, vary: string | null | undefined): string {
  const varied = (vary ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => `${name}=${req.headers.get(name) ?? ''}`);

  return [`${url.pathname}${url.search}`, ...varied].join('|');
}

/**
 * An entry is stale if anything it carries was revalidated after the render
 * that produced it *began* — not after it finished. A purge issued while a slow
 * render was in flight describes data that render already read, so it must
 * still win.
 */
function invalidatedSince(entry: CacheEntry): boolean {
  if (epoch > entry.stamp) return true;
  if ((invalidatedAt.get(`path:${entry.path}`) ?? 0) > entry.stamp) return true;

  return entry.tags.some((tag) => (invalidatedAt.get(tag) ?? 0) > entry.stamp);
}

export function createResponseCache(config: ResponseCacheConfig = {}) {
  const now = config.now ?? Date.now;
  const tagHeader = (config.tagHeader ?? DEFAULT_TAG_HEADER).toLowerCase();
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const entries = new Map<string, CacheEntry>();
  /**
   * Vary header last seen per path, so a lookup can key before it has a
   * response. Bounded like `entries`: a route with unbounded paths must not
   * turn this into a map that only grows.
   */
  const varyByPath = new Map<string, string>();
  /** In-flight background refreshes, so a burst of stale hits costs one origin call. */
  const refreshing = new Map<string, Promise<void>>();

  const evict = (): void => {
    if (entries.size <= maxEntries) return;
    // Map iterates in insertion order, and a read re-inserts: oldest first is LRU.
    const oldest = entries.keys().next().value;

    if (oldest !== undefined) entries.delete(oldest);
  };

  const touch = (key: string, entry: CacheEntry): CacheEntry => {
    entries.delete(key);
    entries.set(key, entry);

    return entry;
  };

  const served = (entry: CacheEntry, state: 'HIT' | 'STALE'): Response =>
    new Response(entry.body as BodyInit, {
      status: entry.status,
      headers: [...entry.headers, ['x-janux-cache', state]],
    });

  /**
   * Buffers the body as it goes to the client and commits the entry only once
   * the stream ends cleanly — a render that dies halfway is exactly the thing
   * that must not become the cached copy of the page.
   */
  const capture = (res: Response, key: string, path: string, window: { freshMs: number; staleMs: number }, stamp: number): Response => {
    const [toClient, toCache] = res.body!.tee();
    const headers = [...res.headers.entries()];
    const storedAt = now();

    const commit = (async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;

      try {
        for await (const chunk of toCache as unknown as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > maxBytes) return;
          chunks.push(chunk);
        }
      } catch {
        return;
      }

      entries.set(key, {
        body: concat(chunks),
        status: res.status,
        headers,
        storedAt,
        stamp,
        path,
        tags: (res.headers.get(tagHeader) ?? '').split(/[\s,]+/).filter(Boolean),
        freshMs: window.freshMs,
        staleMs: window.staleMs,
      });
      evict();
    })().finally(() => refreshing.delete(`commit:${key}`));

    refreshing.set(`commit:${key}`, commit);

    return new Response(toClient, { status: res.status, headers: [...headers, ['x-janux-cache', 'MISS']] });
  };

  const store = async (req: Request, url: URL, produce: () => Promise<Response>): Promise<Response> => {
    // Taken BEFORE the render: a revalidation issued while it runs describes
    // data the render already read, so it has to outrank the entry it produces.
    const stamp = nextStamp();
    const res = await produce();
    const window = shareable(res);

    if (!window || !res.body) return res;
    const vary = res.headers.get('vary');
    const { pathname: path } = url;

    // Which headers a path varies on is only knowable from a response, so it is
    // remembered here: the *next* request can key itself correctly before it
    // has one to read.
    if (vary) {
      varyByPath.set(path, vary);
      if (varyByPath.size > maxEntries) varyByPath.delete(varyByPath.keys().next().value!);
    }

    return capture(res, keyFor(req, url, vary), path, window, stamp);
  };

  return {
    /** Serves from the shared copy when it is allowed to, and keeps one when the response says it may. */
    async handle(req: Request, produce: () => Promise<Response>): Promise<Response> {
      if (req.method !== 'GET') return produce();
      const url = new URL(req.url);
      const key = keyFor(req, url, varyByPath.get(url.pathname));
      const entry = entries.get(key);

      if (!entry || invalidatedSince(entry)) return store(req, url, produce);
      const age = now() - entry.storedAt;

      if (age < entry.freshMs) return served(touch(key, entry), 'HIT');
      if (age >= entry.freshMs + entry.staleMs) return store(req, url, produce);

      if (!refreshing.has(key)) {
        refreshing.set(
          key,
          store(req, url, produce)
            // The client of a STALE hit already has its bytes; this copy exists
            // only to be committed, so it is drained rather than returned.
            .then((res) => res.arrayBuffer().then(() => undefined))
            .catch(() => undefined)
            .finally(() => refreshing.delete(key)),
        );
      }

      return served(entry, 'STALE');
    },

    /** Settles background refreshes and pending commits — for tests and for graceful shutdown. */
    async idle(): Promise<void> {
      await Promise.all([...refreshing.values()]).catch(() => undefined);
    },
  };
}
