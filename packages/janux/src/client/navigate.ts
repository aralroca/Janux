import diff from 'diff-dom-streaming';
import { installI18n } from './i18n';
import { mountIsland, type MountContext } from './mount';
import { consumePrefetched } from './prefetch';
import { singleChunkStream } from './single-chunk';

export interface NavigateOptions {
  signal?: AbortSignal;
}

const esc = (id: string): string =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;

function emitNavigate(phase: 'before' | 'after', from: string, to: string): void {
  document.dispatchEvent(new CustomEvent('janux:navigate', { detail: { phase, from, to } }));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('navigation superseded', 'AbortError');
}

interface PersistedIsland {
  id: string;
  node: Element;
}

/**
 * transition:persist strategy: mounted `persist` islands are lifted out of the
 * document before the diff (live instance and DOM untouched) and grafted back
 * over whatever the incoming page rendered for them — or disposed if it's gone.
 */
function extractPersisted(mount: MountContext): PersistedIsland[] {
  return [...document.querySelectorAll('janux-island[data-jx-persist]')]
    .filter((node) => mount.registry.mounted.has(node.getAttribute('data-jx') ?? ''))
    .map((node) => {
      node.remove();

      return { id: node.getAttribute('data-jx')!, node };
    });
}

async function restorePersisted(mount: MountContext, kept: PersistedIsland[]): Promise<void> {
  await Promise.all(
    kept.map(async ({ id, node }) => {
      const incoming = document.querySelector(`janux-island[data-jx="${esc(id)}"]`);

      if (incoming) incoming.replaceWith(node);
      else await mount.registry.mounted.get(id)?.dispose();
    }),
  );
}

/** Store names still referenced by an island that survived the diff (persisted or newly resumed). */
function storesInUse(mount: MountContext): Set<string> {
  const used = [...mount.registry.mounted.values()].flatMap((instance) =>
    Object.values(instance.def.use ?? {}).map((store) => store.name),
  );

  return new Set(used);
}

/** After the diff: dispose route stores no surviving island still uses. Islands are swept by DOM state. */
async function disposeRouteStores(mount: MountContext): Promise<void> {
  const { registry } = mount;
  const keptStores = storesInUse(mount);
  const dropped = [...registry.stores.entries()].filter(
    ([name, instance]) => instance.def.scope === 'route' && !keptStores.has(name),
  );

  await Promise.all(dropped.map(([, instance]) => instance.dispose()));
  dropped.forEach(([name]) => registry.stores.delete(name));
}

/** App-store snapshots (already-embedded) survive; UI snapshots are replaced by the incoming page. */
function reindexSnapshots(mount: MountContext): void {
  [...mount.registry.snapshots.keys()]
    .filter((uri) => uri.startsWith('ui://'))
    .forEach((uri) => mount.registry.snapshots.delete(uri));
  document.querySelectorAll('script[type="application/janux+state"]').forEach((script) => {
    const uri = script.getAttribute('data-uri');

    if (!uri) return;
    try {
      mount.registry.snapshots.set(uri, JSON.parse(script.textContent ?? '{}'));
    } catch {
      document.dispatchEvent(new CustomEvent('janux:error', { detail: `invalid snapshot ${uri}` }));
    }
  });
}

/** Islands marked `eager` mount without waiting for interaction (editors, event listeners…). */
export async function mountEagerIslands(mount: MountContext): Promise<void> {
  const pending = [...document.querySelectorAll('janux-island[data-jx-eager]')].filter(
    (node) => !mount.registry.mounted.has(node.getAttribute('data-jx') ?? ''),
  );

  await Promise.all(pending.map((node) => mountIsland(node.getAttribute('data-jx')!, node, mount)));
}

async function sweepDisconnected(mount: MountContext): Promise<void> {
  const gone = [...mount.registry.mounted.entries()].filter(
    ([id]) => !document.querySelector(`janux-island[data-jx="${esc(id)}"]`)?.isConnected,
  );

  await Promise.all(gone.map(([, instance]) => instance.dispose()));
}

async function fetchStream(url: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const cached = consumePrefetched(url);

  if (cached) return cached;
  const response = await fetch(url, { signal, headers: { accept: 'text/html' } });

  if (!response.ok) throw new Error(`navigation fetch failed (${response.status})`);

  // Buffer the whole page before diffing: a navigation fetches a complete,
  // server-rendered page, so a single-chunk stream is deterministic and
  // avoids the streaming diff's chunk-boundary edge cases (a swap is not SSR).
  return singleChunkStream(await response.text());
}

/**
 * Diff-then-dispose: nothing is destroyed before the DOM actually changes, so
 * an abort before/during the diff leaves the current page fully intact (kept
 * persisted nodes are re-attached, no island disposed). Disposal happens after,
 * driven by what the diff removed from the document.
 */
async function applyPage(mount: MountContext, stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<void> {
  const kept = extractPersisted(mount);

  try {
    throwIfAborted(signal);
    // The Navigation API drives the transition; diff directly (its own would be skipped).
    await diff(document, stream);
    await restorePersisted(mount, kept);
  } catch (error) {
    // Aborted/failed before the swap committed: put persisted nodes back untouched.
    kept.forEach(({ node }) => {
      if (!node.isConnected) document.body.appendChild(node);
    });
    throw error;
  }
}

async function runNavigation(url: string, mount: MountContext, options: NavigateOptions): Promise<void> {
  const from = location.href;

  emitNavigate('before', from, url);
  try {
    throwIfAborted(options.signal);
    const stream = await fetchStream(url, options.signal);

    throwIfAborted(options.signal);
    await applyPage(mount, stream, options.signal);
    reindexSnapshots(mount);
    installI18n(mount.ctx);
    await sweepDisconnected(mount);
    await disposeRouteStores(mount);
    await mountEagerIslands(mount);
    emitNavigate('after', from, url);
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return;
    document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
    location.href = url;
  }
}

let navChain: Promise<void> = Promise.resolve();

/**
 * SPA navigation: streams the next page's HTML and DIFFS it against the live
 * document (diff-dom-streaming) — unchanged shells are never touched, persisted
 * islands keep their live instances, and everything else re-resumes from the
 * incoming snapshots, exactly like an initial load. Navigations are serialized:
 * a superseded one (aborted by the Navigation API) finishes its cleanup before
 * the next starts, so persisted islands are never lost to a race.
 */
export function performNavigation(url: string, mount: MountContext, options: NavigateOptions = {}): Promise<void> {
  navChain = navChain.then(() => runNavigation(url, mount, options));

  return navChain;
}
