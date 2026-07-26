interface PrefetchEntry {
  body: Promise<ReadableStream<Uint8Array>>;
  at: number;
}

/**
 * Tells the server this is a client navigation, not a first load: it then leaves
 * out what the live document already has (inlined CSS), which is what the
 * streaming diff would otherwise spend its first chunks on.
 */
export const NAVIGATION_HEADERS = { accept: 'text/html', 'x-janux-navigation': '1' };

const prefetched = new Map<string, PrefetchEntry>();
const PREFETCH_TTL = 30_000;

function isFresh(entry: PrefetchEntry | undefined): entry is PrefetchEntry {
  return entry !== undefined && Date.now() - entry.at <= PREFETCH_TTL;
}

/**
 * Warms the next page on link hover; entries expire after 30s. The stream is
 * kept rather than the text: the navigation diffs whatever it is handed, and a
 * body already sitting in the network layer streams instantly.
 */
export function prefetch(url: string): void {
  if (isFresh(prefetched.get(url))) return;
  prefetched.set(url, {
    at: Date.now(),
    body: fetch(url, { headers: NAVIGATION_HEADERS }).then((response) =>
      response.ok && response.body ? response.body : Promise.reject(new Error('prefetch failed')),
    ),
  });
  prefetched.get(url)!.body.catch(() => prefetched.delete(url));
}

/** The prefetched page's stream if still fresh, evicting the entry either way. */
export function consumePrefetched(url: string): Promise<ReadableStream<Uint8Array>> | undefined {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  if (!isFresh(entry)) return undefined;

  return entry.body;
}
