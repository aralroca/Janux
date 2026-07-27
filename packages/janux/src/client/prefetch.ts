interface PrefetchEntry {
  body: Promise<ReadableStream<Uint8Array>>;
  at: number;
}

export interface PrefetchConfig {
  /** Hover-warming on internal links. Default: true. */
  enabled?: boolean;
  /** How long a warmed page stays usable, in ms. Default: 30000. */
  ttl?: number;
}

/**
 * Tells the server this is a client navigation, not a first load: it then leaves
 * out what the live document already has (inlined CSS), which is what the
 * streaming diff would otherwise spend its first chunks on.
 */
export const NAVIGATION_HEADERS = { accept: 'text/html', 'x-janux-navigation': '1' };

const DEFAULTS: Required<PrefetchConfig> = { enabled: true, ttl: 30_000 };
const prefetched = new Map<string, PrefetchEntry>();
let config = DEFAULTS;

/**
 * Applied from `janux.config.ts` (or `boot()`) before navigation is installed.
 * Warmed pages are dropped: they were fetched under the previous rules.
 */
export function configurePrefetch(options: PrefetchConfig | undefined): void {
  config = { ...DEFAULTS, ...options };
  prefetched.clear();
}

function isFresh(entry: PrefetchEntry | undefined): entry is PrefetchEntry {
  return entry !== undefined && Date.now() - entry.at <= config.ttl;
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
  if (!config.enabled || saveData() || isFresh(prefetched.get(url))) return;
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
