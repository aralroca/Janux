import diff from 'diff-dom-streaming';
import { installI18n } from './i18n';
import { mountDocumentForeigns, mountIsland, sweepDisconnectedForeigns, type MountContext } from './mount';
import { consumePrefetched, NAVIGATION_HEADERS } from './prefetch';
import { runScriptsWhileStreaming } from './scripts';

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
  return [...document.querySelectorAll('janux-island[data-jx-persist], janux-foreign[data-jx-persist]')]
    .filter((node) => {
      const id = node.getAttribute('data-jx') ?? '';

      return mount.registry.mounted.has(id) || mount.registry.foreigns.has(id);
    })
    .map((node) => {
      node.remove();

      return { id: node.getAttribute('data-jx')!, node };
    });
}

function persistedSelector(id: string): string {
  return `janux-island[data-jx="${esc(id)}"], janux-foreign[data-jx="${esc(id)}"]`;
}

/**
 * Grafts each persisted island back the moment the diff inserts the incoming
 * stand-in for it, instead of waiting for the navigation to finish. While the
 * page streams those are very different moments: the docs' header lost its
 * search box for 400 ms of an 800 ms navigation and reflowed without it.
 */
function restoreWhileStreaming(kept: PersistedIsland[]): () => void {
  const pending = new Map(kept.map(({ id, node }) => [id, node]));
  const observer = new MutationObserver(() => {
    pending.forEach((node, id) => {
      const standIn = document.querySelector(persistedSelector(id));

      if (!standIn || standIn === node) return;
      standIn.replaceWith(node);
      pending.delete(id);
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => observer.disconnect();
}

async function restorePersisted(mount: MountContext, kept: PersistedIsland[]): Promise<void> {
  await Promise.all(
    kept.map(async ({ id, node }) => {
      const incoming = document.querySelector(persistedSelector(id));

      if (incoming) incoming.replaceWith(node);
      else if (mount.registry.foreigns.has(id)) {
        mount.registry.foreigns.get(id)!.dispose();
        mount.registry.foreigns.delete(id);
      } else await mount.registry.mounted.get(id)?.dispose();
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

/**
 * The page as a stream, so the diff can apply it while it arrives — a slow
 * server paints progressively instead of showing the old page until the last
 * byte. (It used to be buffered into one chunk; that is a whole page's latency
 * spent looking at the previous one.)
 */
async function fetchPage(url: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const cached = await consumePrefetched(url);

  if (cached !== undefined) return cached;
  const response = await fetch(url, { signal, headers: NAVIGATION_HEADERS });

  if (!response.ok) throw new Error(`navigation fetch failed (${response.status})`);
  if (!response.body) throw new Error('navigation fetch failed (no body)');

  return response.body;
}

/** Marks a runtime-injected body node the whole-document diff must not own. */
export const KEEP_ATTRIBUTE = 'data-janux-keep';

/**
 * Snapshots where `nodes` live and, once the diff has run, puts back whatever it
 * removed — in place, since a node the app positioned inside its own layout must
 * not reappear at the end of the body. A parent the diff also removed falls back
 * to `fallback`.
 */
function keepAttached(nodes: Element[], fallback: Element): () => void {
  const places = nodes.map((node) => ({ node, parent: node.parentElement, next: node.nextElementSibling }));

  return () =>
    places
      .filter(({ node }) => !node.isConnected)
      .forEach(({ node, parent, next }) => {
        const host = parent?.isConnected ? parent : fallback;

        host.insertBefore(node, next?.isConnected && next.parentElement === host ? next : null);
      });
}

/**
 * Runtime-injected stylesheets (a lazy-loaded editor's CSS, vite dev styles)
 * exist only in the live <head>: the incoming page doesn't list them, so the
 * diff drops them — and the module that injected them won't run again on a
 * later remount. Snapshot them before the swap, resurrect whatever it removed.
 */
function keepRuntimeStyles(): () => void {
  return keepAttached([...document.head.querySelectorAll('style, link[rel="stylesheet"]')], document.head);
}

/**
 * Same story one level down: an agent feedback overlay, a portal root or any
 * node a runtime injected into the page belongs to the session, not to the
 * route, so the diff would drop it for good. Opt in with `data-janux-keep`.
 */
function keepRuntimeNodes(): () => void {
  return keepAttached([...document.body.querySelectorAll(`[${KEEP_ATTRIBUTE}]`)], document.body);
}

/**
 * Diff-then-dispose: nothing is destroyed before the DOM actually changes, so
 * an abort before/during the diff leaves the current page fully intact (kept
 * persisted nodes are re-attached, no island disposed). Disposal happens after,
 * driven by what the diff removed from the document.
 */
async function applyPage(mount: MountContext, page: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<void> {
  const kept = extractPersisted(mount);
  const stopRestoring = restoreWhileStreaming(kept);
  const stopRunningScripts = runScriptsWhileStreaming();
  const restoreStyles = keepRuntimeStyles();
  const restoreRuntimeNodes = keepRuntimeNodes();

  try {
    throwIfAborted(signal);
    // The Navigation API drives the transition; diff directly (its own would be skipped).
    await diff(document, page);
    await restorePersisted(mount, kept);
  } catch (error) {
    /*
     * Persisted islands go back untouched — losing a live editor to a superseded
     * navigation would be the worst outcome here. The document itself may be
     * half-updated: the diff applies the page as it streams, and whatever
     * superseded this navigation diffs the same document to the page it wants.
     */
    kept.forEach(({ node }) => {
      if (!node.isConnected) document.body.appendChild(node);
    });
    throw error;
  } finally {
    stopRunningScripts();
    stopRestoring();
    restoreStyles();
    restoreRuntimeNodes();
  }
}

function reportNavigationError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
}

/** Everything that happens once the new page is on screen. */
async function wireUpPage(mount: MountContext): Promise<void> {
  reindexSnapshots(mount);
  installI18n(mount.ctx);
  await sweepDisconnected(mount);
  sweepDisconnectedForeigns(mount);
  await disposeRouteStores(mount);
  await mountEagerIslands(mount);
  // Foreign roots after navigation: mount the new page's hosts and push the
  // morph-synced call-site props into hosts that survived the swap.
  await mountDocumentForeigns(mount);
}

async function runNavigation(url: string, mount: MountContext, options: NavigateOptions): Promise<void> {
  const from = location.href;

  emitNavigate('before', from, url);
  try {
    throwIfAborted(options.signal);
    const page = await fetchPage(url, options.signal);

    throwIfAborted(options.signal);
    await applyPage(mount, page, options.signal);
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return;
    reportNavigationError(error);
    // Nothing reached the screen (a failed swap rolls itself back), so the
    // browser is the only way left to get there.
    location.href = url;

    return;
  }
  try {
    await wireUpPage(mount);
    emitNavigate('after', from, url);
  } catch (error) {
    /*
     * The requested page IS on screen — handing the URL to the browser now would
     * fetch it again, mount the same island, and fail the same way: a
     * deterministic mount error (a broken editor island on /playground) turns
     * into an endless refresh. Report it and leave the page standing.
     */
    if ((error as any)?.name !== 'AbortError') reportNavigationError(error);
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
