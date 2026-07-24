interface PrefetchEntry {
  body: Promise<string>;
  at: number;
}

const prefetched = new Map<string, PrefetchEntry>();
const PREFETCH_TTL = 30_000;

function isFresh(entry: PrefetchEntry | undefined): entry is PrefetchEntry {
  return entry !== undefined && Date.now() - entry.at <= PREFETCH_TTL;
}

/** Warms the next page on link hover; entries expire after 30s. */
export function prefetch(url: string): void {
  if (isFresh(prefetched.get(url))) return;
  prefetched.set(url, {
    at: Date.now(),
    body: fetch(url, { headers: { accept: 'text/html' } }).then((response) =>
      response.ok ? response.text() : Promise.reject(new Error('prefetch failed')),
    ),
  });
  prefetched.get(url)!.body.catch(() => prefetched.delete(url));
}

/** Returns the prefetched page's HTML if still fresh, evicting the entry either way. */
export function consumePrefetched(url: string): Promise<string> | undefined {
  const entry = prefetched.get(url);

  prefetched.delete(url);
  if (!isFresh(entry)) return undefined;

  return entry.body;
}
