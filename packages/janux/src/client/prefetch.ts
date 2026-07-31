/** A navigable response: its body, plus the CSP nonce the SERVER served it with. */
export interface NavigablePage {
  body: ReadableStream<Uint8Array>;
  /** Empty when the app does not use CSP. Only the header is trusted — markup can forge anything. */
  nonce: string;
}

interface PrefetchEntry {
  body: Promise<NavigablePage>;
  at: number;
  /** The page this entry serves — its document, or the route manifest that goes with it. */
  page: string;
  /** Aborting hands the connection back, whether or not the body has arrived. */
  request: AbortController;
}

export interface PrefetchConfig {
  /** How long a warmed page stays usable, in ms. Default: 30000. */
  ttl?: number;
}

/**
 * Tells the server this is a client navigation, not a first load: it then leaves
 * out what the live document already has (inlined CSS), which is what the
 * streaming diff would otherwise spend its first chunks on.
 */
export const NAVIGATION_HEADERS = { accept: 'text/html', 'x-janux-navigation': '1' };

/** Mirrors `NONCE_HEADER` in @janux/server: this response's nonce, out of reach of its own markup. */
const NONCE_HEADER = 'x-janux-nonce';

export const MANIFEST_HEADERS = { accept: 'application/json' };

/**
 * The route manifest the destination needs, or nothing when the shell doesn't
 * advertise one — a static export omits the link precisely because `/_janux/*`
 * isn't served there, so absence means: don't ask.
 */
export function routeManifestUrl(path: string): string | undefined {
  if (!document.getElementById('jx-manifest')) return undefined;

  return `/_janux/manifest?path=${encodeURIComponent(path)}`;
}

/**
 * The stream a navigation can apply, or nothing.
 *
 * A 404 or a 500 carrying a document IS the page for that URL — the app's
 * `_404`/`_500` — and the diff applies it like any other. Only a response with
 * no document to show (the bare status line an app without those pages answers,
 * a proxy's plain-text error) is a failed navigation, and there the browser
 * takes over.
 */
export function navigableBody(response: Response): NavigablePage | undefined {
  if (!response.body) return undefined;
  const page = { body: response.body, nonce: response.headers.get(NONCE_HEADER) ?? '' };

  if (response.ok) return page;

  return response.headers.get('content-type')?.includes('text/html') ? page : undefined;
}

const DEFAULT_TTL = 30_000;
/** Warmed-but-unopened pages hold real connections; a hover tour must not pile them up. */
const MAX_WARM = 8;
/** Settling this long is what separates intent from a pointer passing through. */
const HOVER_DELAY = 60;
const prefetched = new Map<string, PrefetchEntry>();
let ttl = DEFAULT_TTL;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverUrl: string | undefined;

function cancelHover(): void {
  clearTimeout(hoverTimer);
  hoverUrl = undefined;
}

/**
 * Applied from `janux.config.ts` (or `boot()`) before navigation is installed.
 * Warmed pages are dropped: they were fetched under the previous rules.
 */
export function configurePrefetch(options: PrefetchConfig | undefined): void {
  ttl = options?.ttl ?? DEFAULT_TTL;
  cancelHover();
  [...prefetched.keys()].forEach(drop);
}

function isFresh(entry: PrefetchEntry | undefined): entry is PrefetchEntry {
  return entry !== undefined && Date.now() - entry.at <= ttl;
}

function drop(url: string): void {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  // Both, because a warmed response can be in either state: still on the wire,
  // or headers in hand with an unopened body. Each keeps the connection.
  entry?.request.abort();
  entry?.body.then((page) => page.body.cancel()).catch(() => {});
}

/** Pages, not entries: a page and its route manifest are warmed as one unit. */
function warmPages(): number {
  return new Set([...prefetched.values()].map((entry) => entry.page)).size;
}

function evict(): void {
  [...prefetched.keys()].filter((url) => !isFresh(prefetched.get(url))).forEach(drop);
  // Map iteration is insertion-ordered, so the first key is the oldest.
  while (warmPages() >= MAX_WARM) drop(prefetched.keys().next().value!);
}

/** Warming a page the user may never open is their data, not ours. */
function saveData(): boolean {
  return (navigator as any)?.connection?.saveData === true;
}

function warmBody(url: string, headers: HeadersInit, signal: AbortSignal): Promise<NavigablePage> {
  // Low on purpose: a page nobody has opened yet must never outrank what the
  // page the user is actually on is still loading.
  return fetch(url, { headers, signal, priority: 'low' }).then(
    (response) => navigableBody(response) ?? Promise.reject(new Error('prefetch failed')),
  );
}

function warm(url: string, page: string, headers: HeadersInit): void {
  if (isFresh(prefetched.get(url))) return;
  // Two pages can share one manifest URL (same path, different query). Replace a
  // stale entry rather than orphaning it with its request still open.
  drop(url);
  const request = new AbortController();
  const entry: PrefetchEntry = { at: Date.now(), page, request, body: warmBody(url, headers, request.signal) };

  prefetched.set(url, entry);
  // Identity-checked: a slow failure must not delete a NEWER entry for the URL.
  entry.body.catch(() => {
    if (prefetched.get(url) === entry) prefetched.delete(url);
  });
}

/**
 * Warms the next page. The stream is kept rather than the text: the navigation
 * diffs whatever it is handed, and a body already sitting in the network layer
 * streams instantly.
 *
 * The route manifest comes along, because the destination needs it too and it
 * used to be requested only once the page was already on screen.
 */
export function prefetch(url: string): void {
  const destination = new URL(url, location.href);
  const manifest = routeManifestUrl(destination.pathname);

  // The page already on screen has nothing to warm — hovering its own nav entry
  // is the common way to ask for it.
  if (destination.href === location.href) return;
  if (saveData() || isFresh(prefetched.get(url))) return;
  evict();
  warm(url, url, NAVIGATION_HEADERS);
  if (manifest) warm(manifest, url, MANIFEST_HEADERS);
}

/**
 * Warms the page the pointer settles on, and only that one. Warming every link
 * a mouse crosses on its way down a menu is how ten pages end up sharing the
 * wire with the one that was actually clicked.
 */
export function prefetchOnHover(url: string): void {
  // `mouseover` fires again for every element inside the link (an icon, a
  // label). Still the same link, so the countdown continues instead of restarting.
  if (url === hoverUrl) return;
  cancelHover();
  hoverUrl = url;
  hoverTimer = setTimeout(() => {
    cancelHover();
    prefetch(url);
  }, HOVER_DELAY);
}

/** The warmed stream if still fresh, evicting the entry either way. */
function take(url: string): Promise<NavigablePage> | undefined {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  if (!isFresh(entry)) return undefined;

  return entry.body;
}

/**
 * The prefetched page's stream, and the end of every warm-up for anywhere else.
 *
 * A navigation cannot promote its own request — it is reading one that started
 * life as a low-priority prefetch — so the only way to hand it the connection
 * is to stop the pages the pointer merely passed over. The destination's own
 * manifest survives: it is part of this navigation, not competition for it.
 */
export function consumePrefetched(url: string): Promise<NavigablePage> | undefined {
  const page = take(url);

  // A click settles where the pointer was going: a hover still counting down
  // would otherwise fire mid-navigation and refetch the page being opened.
  cancelHover();
  [...prefetched.entries()].filter(([, entry]) => entry.page !== url).forEach(([other]) => drop(other));

  return page;
}

/** The route manifest warmed with the page, for the first read after landing on it. */
export function consumeWarmManifest(path: string): Promise<ReadableStream<Uint8Array>> | undefined {
  const url = routeManifestUrl(path);
  const warmed = url ? take(url) : undefined;

  return warmed?.then(({ body }) => body);
}
