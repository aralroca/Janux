interface PrefetchEntry {
  body: Promise<ReadableStream<Uint8Array>>;
  at: number;
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

const DEFAULT_TTL = 30_000;
/** Warmed-but-unopened pages hold real connections; a hover tour must not pile them up. */
const MAX_WARM = 8;
const prefetched = new Map<string, PrefetchEntry>();
let ttl = DEFAULT_TTL;

/**
 * Applied from `janux.config.ts` (or `boot()`) before navigation is installed.
 * Warmed pages are dropped: they were fetched under the previous rules.
 */
export function configurePrefetch(options: PrefetchConfig | undefined): void {
  ttl = options?.ttl ?? DEFAULT_TTL;
  prefetched.clear();
}

function isFresh(entry: PrefetchEntry | undefined): entry is PrefetchEntry {
  return entry !== undefined && Date.now() - entry.at <= ttl;
}

function drop(url: string): void {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  // Cancelling hands the connection back — an unopened body keeps it occupied.
  entry?.body.then((body) => body.cancel()).catch(() => {});
}

function evict(): void {
  [...prefetched.keys()].filter((url) => !isFresh(prefetched.get(url))).forEach(drop);
  // Map iteration is insertion-ordered, so the first key is the oldest.
  while (prefetched.size >= MAX_WARM) drop(prefetched.keys().next().value!);
}

/** Warming a page the user may never open is their data, not ours. */
function saveData(): boolean {
  return (navigator as any)?.connection?.saveData === true;
}

/**
 * Warms the next page on link hover. The stream is kept rather than the text:
 * the navigation diffs whatever it is handed, and a body already sitting in the
 * network layer streams instantly.
 */
export function prefetch(url: string): void {
  if (saveData() || isFresh(prefetched.get(url))) return;
  evict();
  const entry: PrefetchEntry = {
    at: Date.now(),
    body: fetch(url, { headers: NAVIGATION_HEADERS }).then((response) =>
      response.ok && response.body ? response.body : Promise.reject(new Error('prefetch failed')),
    ),
  };

  prefetched.set(url, entry);
  // Identity-checked: a slow failure must not delete a NEWER entry for the URL.
  entry.body.catch(() => {
    if (prefetched.get(url) === entry) prefetched.delete(url);
  });
}

/** The prefetched page's stream if still fresh, evicting the entry either way. */
export function consumePrefetched(url: string): Promise<ReadableStream<Uint8Array>> | undefined {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  if (!isFresh(entry)) return undefined;

  return entry.body;
}
