import diff from 'diff-dom-streaming';
import { mountDocumentForeigns, mountIsland, sweepDisconnectedForeigns, type MountContext } from './mount';
import { scanMarkers, scanTree } from './events';
import { consumePrefetched, navigableBody, NAVIGATION_HEADERS, type NavigablePage } from './prefetch';
import { saveWidgetFocus, settleRouteA11y } from './route-a11y';
import { runScriptsWhileStreaming } from './scripts';
import { applyScrollPlan, type ScrollPlan } from './scroll';
import { rescopeSpeculationRules } from './speculation';
import { applyWithViewTransition, viewTransitionSettled, viewTransitionsWanted } from './view-transition';

export interface NavigateOptions {
  signal?: AbortSignal;
  /** How the incoming page should be scrolled. Absent means "a new page": the top. */
  scroll?: ScrollPlan;
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

/**
 * A persisted island the incoming page does not render is disposed — that is
 * the contract (`persist` keeps the instance across pages that render it), but
 * when it bites it looks like "my assistant closed itself on navigation", so
 * it is said out loud, like every other developer-mistake warning here.
 */
function warnDroppedPersist(id: string): void {
  console.warn(
    `Janux: persisted island "${id}" is not rendered by ${location.pathname}, so its live instance was disposed. Render it on every route (e.g. from a shared layout) to keep it alive across navigations.`,
  );
}

async function restorePersisted(mount: MountContext, kept: PersistedIsland[]): Promise<void> {
  await Promise.all(
    kept.map(async ({ id, node }) => {
      const incoming = document.querySelector(persistedSelector(id));

      // Already grafted back mid-stream, by the observer above — the same
      // check it makes, which this one was missing. Replacing a node with
      // itself is a no-op only on paper: engines run the full remove and
      // insert, so an <iframe> in the subtree reloads and a custom element
      // inside it gets a disconnected/connected pair it should never see.
      if (incoming === node) return;
      if (incoming) incoming.replaceWith(node);
      else {
        warnDroppedPersist(id);
        if (mount.registry.foreigns.has(id)) {
          mount.registry.foreigns.get(id)!.dispose();
          mount.registry.foreigns.delete(id);
        } else await mount.registry.mounted.get(id)?.dispose();
      }
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
  // A new page is a new resume cycle: its scripts are fresh state, not leftovers.
  mount.registry.consumedSnapshots.clear();
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

/**
 * A navigation hands every non-persisted island the incoming page's DOM, so a
 * live instance that survived the diff (same key on both pages, morphed in
 * place) is stale: the DOM shows the new server render, the instance holds the
 * old state, and the next click would continue from state the page no longer
 * displays. Dispose them all — the next interaction re-resumes from the new
 * page's snapshot. Only islands in a persisted subtree keep their instance:
 * opting into surviving navigations is what `persist` is.
 */
async function sweepStaleInstances(mount: MountContext): Promise<void> {
  const stale = [...mount.registry.mounted.entries()].filter(([id]) => {
    const host = document.querySelector(`janux-island[data-jx="${esc(id)}"]`);

    if (!host?.isConnected) return true;
    if (host.closest('janux-island[data-jx-persist]')) return false;

    // Born during THIS navigation: the user interacted while the page was
    // still streaming in. That state is the new page's, not a leftover.
    return (mount.registry.mountedEpoch.get(id) ?? 0) < (mount.epoch ?? 0);
  });

  await Promise.all(stale.map(([, instance]) => instance.dispose()));
}

/**
 * The page as a stream, so the diff can apply it while it arrives — a slow
 * server paints progressively instead of showing the old page until the last
 * byte. (It used to be buffered into one chunk; that is a whole page's latency
 * spent looking at the previous one.)
 */
async function fetchPage(url: string, signal?: AbortSignal): Promise<NavigablePage> {
  const cached = await consumePrefetched(url);

  // The contract: the returned stream dies with the navigation's signal. A
  // fresh fetch is signal-bound natively; a prefetched body was fetched before
  // any navigation existed, so it gets wrapped.
  if (cached !== undefined) return { ...cached, body: abortableStream(cached.body, signal) };
  const response = await fetch(url, { signal, headers: NAVIGATION_HEADERS });
  const page = navigableBody(response);

  if (!page) throw new Error(`navigation fetch failed (${response.status})`);

  return page;
}

/**
 * A `<dialog>` the diff left in the top layer with no `open` attribute.
 *
 * `showModal()` makes the rest of the document inert, and the browser tracks that
 * in the top layer, not in the attribute — so when the diff syncs attributes and
 * strips `open`, the page stays inert with nothing to click, and `close()` no
 * longer helps: its first step reads the attribute it just lost. Restoring the
 * attribute and closing releases the top layer and fires `close`, so the app hears
 * about it. Reported as "no link works after searching".
 */
function isStrandedModal(dialog: Element): boolean {
  try {
    return dialog.matches(':modal') && !dialog.hasAttribute('open');
  } catch {
    return false; // `:modal` is not everywhere yet (happy-dom, older engines).
  }
}

export function closeStrandedModals(): void {
  document.querySelectorAll('dialog').forEach((dialog) => {
    if (!isStrandedModal(dialog)) return;
    dialog.setAttribute('open', '');
    (dialog as HTMLDialogElement).close();
  });
}

/**
 * Watches for one appearing, so an inert page is a frame long rather than the
 * rest of the navigation: a modal opened while the page streams in is stripped by
 * the diff the moment it reaches that part of the document.
 */
function keepModalsHonest(): () => void {
  const observer = new MutationObserver(closeStrandedModals);

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['open'], subtree: true });

  return () => {
    closeStrandedModals();
    observer.disconnect();
  };
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
  const restore = () =>
    places
      .filter(({ node }) => !node.isConnected)
      .forEach(({ node, parent, next }) => {
        const host = parent?.isConnected ? parent : fallback;

        host.insertBefore(node, next?.isConnected && next.parentElement === host ? next : null);
      });
  /*
   * Restored the instant the diff drops one, not when the navigation ends. While
   * the page streams in those are seconds apart, and for a stylesheet the
   * difference is the whole page rendering unstyled: measured at 2.25 s of a
   * 2.6 s navigation, with `<head>` holding zero style nodes — every element
   * where the browser puts an unstyled one.
   */
  const observer = new MutationObserver(restore);

  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    restore();
  };
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
 * What identifies a stylesheet across the two trees.
 *
 * `id` before text because the incoming node is still streaming: its content
 * may not have arrived when the predicate is asked about it, and keying on a
 * half-parsed `<style>` would fail to match its live twin and insert a copy.
 */
function sheetKey(node: Node | null): string | null {
  const el = node as Element | null;
  const tag = el?.tagName;

  if (tag === 'LINK') return el!.getAttribute('rel') === 'stylesheet' ? `l:${el!.getAttribute('href')}` : null;
  if (tag !== 'STYLE') return null;

  return el!.id ? `i:${el!.id}` : `s:${el!.textContent}`;
}

/**
 * Stylesheets the document already has, on BOTH sides of the diff.
 *
 * A `<link>` the browser has to re-acquire blocks rendering until it resolves,
 * so detaching one — or dropping in the incoming page's copy of a sheet already
 * applied — paints the page unstyled for a frame. That is the flash
 * `keepRuntimeStyles` was undoing rather than preventing. Ignoring both copies
 * leaves the live sheet untouched and its `<link>` element in place.
 *
 * Runtime-injected sheets (a lazy editor's CSS, the dev server's) exist only
 * here, so the incoming page never lists them and the prune took them all —
 * A sheet this page does not have yet is not in the set, so it still applies.
 */
function ignoreAppliedStyles(): (node: Node | null) => boolean {
  const applied = new Set(
    [...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map(sheetKey),
  );

  return (node) => {
    const key = sheetKey(node);

    return key !== null && applied.has(key);
  };
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
 * The page stream tied to the navigation's own signal. The fetch dies with its
 * signal, but a prefetched body has no fetch signal of its own — without this,
 * a superseded navigation keeps consuming (and keeps diffing) while the next
 * one waits behind it in the chain. Aborting also cancels the source, so the
 * network gives the connection back.
 */
export function abortableStream(
  page: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  if (!signal) return page;
  const reader = page.getReader();
  const abortError = () => signal.reason ?? new DOMException('navigation superseded', 'AbortError');
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      // Reject first: cancelling resolves an in-flight read() as done, which
      // would win the race and read as a cleanly-finished page.
      reject(abortError());
      reader.cancel(abortError()).catch(() => {});
    };

    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });

  // The abort may fire after the stream was fully consumed; nobody is racing then.
  aborted.catch(() => {});

  return new ReadableStream({
    async pull(controller) {
      try {
        // `aborted` first: with both settled (abort before the first pull, which
        // also resolves the cancelled read as done), race takes the first entry.
        const { value, done } = await Promise.race([aborted, reader.read()]);

        if (done) controller.close();
        else controller.enqueue(value!);
      } catch (error) {
        // Explicit: some stream implementations drop a pull rejection silently.
        controller.error(error);
      }
    },
    cancel(reason: unknown) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Diff-then-dispose: nothing is destroyed before the DOM actually changes, so
 * an abort before/during the diff leaves the current page fully intact (kept
 * persisted nodes are re-attached, no island disposed). Disposal happens after,
 * driven by what the diff removed from the document.
 */
/**
 * A page can bind an event type this document never listened for, and the user
 * can interact with a control the moment the stream paints it — several hundred
 * ms before the diff completes. Install listeners as elements arrive.
 */
function installListenersWhileStreaming(): () => void {
  const observer = new MutationObserver((records) => {
    records.forEach(({ addedNodes }) =>
      addedNodes.forEach((node) => {
        if (node instanceof Element) scanTree(node);
      }),
    );
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => observer.disconnect();
}

/**
 * Reads the whole page into memory, then hands it back as a stream that is
 * already complete. Only for the view-transition path.
 *
 * A transition suppresses rendering until its callback resolves, so diffing a
 * live stream inside one would freeze the page for the entire download — and
 * past four seconds the browser abandons the transition outright. Buffering out
 * here inverts that: the old page stays live and interactive while the next one
 * arrives, and only the swap itself, with nothing left to await, is animated.
 */
async function buffered(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];

  // A reader is a cursor, not an iterable: draining it is the one loop here.
  for (let read = await reader.read(); !read.done; read = await reader.read()) chunks.push(read.value!);

  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

/**
 * A live foreign host's children are React's: the morph must not rewrite DOM
 * its fibers still reference — a later render bails out against text it never
 * wrote (the state looks committed but the page shows the incoming SSR copy),
 * and unmount throws `removeChild` on nodes it moved. The host element itself
 * still diffs: the refreshed `data-jxf-props` attribute is what
 * `mountDocumentForeigns` pushes into the live root after the swap. Hosts with
 * no live root (first visit, hydrate-on-visible still pending) take the
 * incoming SSR children as always.
 */
function skipLiveForeignChildren(mount: MountContext): (node: Node | null) => boolean {
  return (node) =>
    (node as Element | null)?.nodeName === 'JANUX-FOREIGN' &&
    mount.registry.foreigns.has((node as Element).getAttribute('data-jx') ?? '');
}

async function applyPage(mount: MountContext, page: NavigablePage, options: NavigateOptions = {}): Promise<void> {
  const { signal } = options;
  const source = viewTransitionsWanted() ? await buffered(page.body) : page.body;
  const kept = extractPersisted(mount);
  const stopRestoring = restoreWhileStreaming(kept);
  const stopInstallingListeners = installListenersWhileStreaming();
  const stopRunningScripts = runScriptsWhileStreaming(page.nonce);
  const restoreStyles = keepRuntimeStyles();
  const restoreRuntimeNodes = keepRuntimeNodes();
  const stopWatchingModals = keepModalsHonest();

  try {
    throwIfAborted(signal);
    /*
     * One transition around the whole swap — the diff AND the grafting back of
     * persisted islands — so the browser snapshots a complete old page against
     * a complete new one and can pair the shared elements. Without an opted-in
     * app this is just the callback, run directly.
     */
    await applyWithViewTransition(async () => {
      // The Navigation API drives the transition; diff directly (its own would be skipped).
      await diff(document, source, {
        shouldIgnoreNode: ignoreAppliedStyles(),
        shouldSkipChildren: skipLiveForeignChildren(mount),
      });
      /*
       * A superseded navigation must not report success: the diff can finish
       * cleanly on a cancelled stream, having applied only the part that arrived,
       * and the page that navigation was going to is not the page on screen.
       * Whatever superseded it is already diffing the same document.
       */
      throwIfAborted(signal);
      await restorePersisted(mount, kept);
      /*
       * Last step of the swap, and inside the transition on purpose: the
       * browser snapshots the new page the moment this callback resolves, so
       * scrolling afterwards would animate to the old offset and then jump.
       */
      applyScrollPlan(options.scroll);
    }, signal);
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
    stopInstallingListeners();
    restoreStyles();
    restoreRuntimeNodes();
    stopWatchingModals();
  }
}

function reportNavigationError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
}

/** Everything that happens once the new page is on screen. */
async function wireUpPage(mount: MountContext): Promise<void> {
  reindexSnapshots(mount);
  // The new page can bind event types this document has never listened for.
  scanMarkers(document);
  // The incoming page brought the server's document-wide speculation rules.
  rescopeSpeculationRules();
  // Boot features re-read their per-page payloads (i18n's dictionary among them).
  mount.refresh?.forEach((refresh) => refresh());
  await sweepStaleInstances(mount);
  sweepDisconnectedForeigns(mount);
  await disposeRouteStores(mount);
  await mountEagerIslands(mount);
  // Foreign roots after navigation: mount the new page's hosts and push the
  // morph-synced call-site props into hosts that survived the swap.
  await mountDocumentForeigns(mount);
}

async function runNavigation(url: string, mount: MountContext, options: NavigateOptions): Promise<void> {
  const from = location.href;

  // Everything mounted before this line belongs to the page being left.
  mount.epoch = (mount.epoch ?? 0) + 1;
  emitNavigate('before', from, url);
  // Read while the widget is still in the document: applying the page lifts
  // persisted islands out of it, and removing a node blurs whatever it held.
  const widgetFocus = saveWidgetFocus();

  try {
    throwIfAborted(options.signal);
    const page = await fetchPage(url, options.signal);

    throwIfAborted(options.signal);
    await applyPage(mount, page, options);
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
    /*
     * Last, so `after` means "settled": the page is on screen, its islands are
     * wired, the transition has finished animating, and only then is the change
     * announced and focus moved — a transition is not a moment to speak into or
     * to focus during. Resolves immediately when there was no transition.
     */
    await viewTransitionSettled();
    settleRouteA11y(widgetFocus);
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
