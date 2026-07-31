import { createBus } from '../runtime/bus';
import type { ComponentDef } from '../define/types';
import type { ForeignDef } from '../interop';
import type { AuditEntry, Proposal } from '../runtime/intents';
import { createBridge, type JanuxBridge } from './bridge';
import { listen } from './events';
import { mountDocumentForeigns, mountIsland, type MountContext } from './mount';
import { createClientRegistry, registerDef, type IslandLoader } from './registry';
import { enableAgentGlow, type GlowOptions } from './glow';
import { installI18n } from './i18n';
import type { NavigationConfig } from '../config';
import { mountEagerIslands, performNavigation } from './navigate';
import { captureNonce } from './nonce';
import { configurePrefetch, prefetchOnHover } from './prefetch';
import { rescopeSpeculationRules, shellNavigationConfig } from './speculation';
import { installWebMCP } from './webmcp';

export interface BootOptions {
  islands?: Record<string, IslandLoader>;
  defs?: (ComponentDef | ForeignDef)[];
  ctx?: Record<string, unknown>;
  /** Highlight islands while an agent operates them. `true` or `{ duration }`. */
  glow?: boolean | GlowOptions;
  /**
   * SPA navigation via the Navigation API + streamed DOM diff. Default: true.
   * Overrides `navigation` from `janux.config.ts`, which is where an app
   * normally configures this.
   */
  navigation?: boolean;
  /** Register mounted tools with `document.modelContext` (WebMCP), polyfilled when absent. Default: true. */
  webmcp?: boolean;
  /**
   * Observes every client-side `AuditEntry` (tool, origin, guard, input,
   * ok/error). Each entry is also dispatched as a `janux:audit` DOM event —
   * the same mirror `janux:proposal` has — so an audit-trail island can
   * subscribe instead of re-recording actions inside every `run()`.
   */
  onAudit?: (entry: AuditEntry) => void;
}

export interface JanuxClient extends JanuxBridge {
  mount(id: string): Promise<unknown>;
  navigate(url: string): Promise<void>;
  proposals: Map<string, Proposal>;
}

function readSnapshots(mount: MountContext): void {
  document.querySelectorAll('script[type="application/janux+state"]').forEach((script) => {
    const uri = script.getAttribute('data-uri');

    if (!uri) return;
    try {
      mount.registry.snapshots.set(uri, JSON.parse(script.textContent ?? '{}'));
    } catch {
      reportIntentError(`invalid state snapshot for ${uri}`);
    }
  });
}

function trackInflight(mount: MountContext, work: Promise<unknown>): void {
  awaitTracked(mount, work).catch(reportIntentError);
}

function reportIntentError(error: unknown): void {
  document.dispatchEvent(new CustomEvent('janux:error', { detail: String(error) }));
}

/** Tracks navigation work in `inflight` (settled() waits it) while propagating failures. */
async function awaitTracked(mount: MountContext, work: Promise<unknown>): Promise<void> {
  mount.inflight.add(work);
  try {
    await work;
  } finally {
    mount.inflight.delete(work);
  }
}

let nativeClickAt = 0;

export type NavigateAction = 'intercept' | 'cancel' | 'default';

// Prefer the precise source element; fall back to a recent data-native click.
function fromNativeLink(event: any): boolean {
  if (event.sourceElement) return !!event.sourceElement.closest?.('[data-native]');
  const wasNative = Date.now() - nativeClickAt < 100;

  nativeClickAt = 0;

  return wasNative;
}

/** What the router does with a navigation: take it over, cancel it, or leave it to the browser. */
export function navigateAction(event: any): NavigateAction {
  if (!event.canIntercept || event.hashChange || event.downloadRequest || event.formData) return 'default';
  const destination = new URL(event.destination.url);

  if (destination.origin !== location.origin) return 'default';
  // Before the same-URL check: a data-native link to the current page keeps the
  // native behavior it asked for — a reload. Same for an explicit reload.
  if (fromNativeLink(event)) return 'default';
  if (event.navigationType === 'reload') return 'default';
  /*
   * The page we are already on. Diffing it against itself is not free: islands
   * are torn down and re-mounted against DOM the diff has just replaced, which
   * is how clicking "Playground" while on /playground emptied the editor. But
   * declining to intercept is not a no-op either: the browser then performs the
   * default action, a full cross-document reload — every island lost, the open
   * assistant included. The navigation is cancelled instead: same URL, nothing
   * to do, so nothing happens. (`client.navigate()` short-circuits the same
   * case before it ever raises a navigate event.)
   */
  if (destination.href === location.href) return 'cancel';
  // Query-only changes on the same path are shallow: islands read the query
  // reactively (urlState), so a filter/tab/dialog change never re-renders the
  // page. Cross-path navigations still get the SPA diff.
  if (destination.pathname === location.pathname && destination.search !== location.search) return 'default';

  return 'intercept';
}

/**
 * Navigation API interception (Baseline 2026). Browsers without it keep
 * native MPA links — which already work — so there is no History fallback,
 * and no hover-prefetch either: without interception nothing would ever
 * consume that cache (the speculation rules cover those browsers instead).
 */
function installNavigation(mount: MountContext, config: NavigationConfig): void {
  const nav = (window as any).navigation;

  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element | null)?.closest?.('[data-native]')) nativeClickAt = Date.now();
    },
    true,
  );
  if (!nav) return; // No interception: the server's document-wide rules stand.
  nav.addEventListener('navigate', (event: any) => {
    const action = navigateAction(event);

    // Only cancelable events can be cancelled; one that is not (a traversal)
    // falls through to the browser's own handling, exactly as before.
    if (action === 'cancel') {
      if (event.cancelable) event.preventDefault();

      return;
    }
    if (action !== 'intercept') return;
    event.intercept({
      scroll: 'after-transition',
      handler: () =>
        awaitTracked(mount, performNavigation(event.destination.url, mount, { signal: event.signal })),
    });
  });
  rescopeSpeculationRules();
  if (config.prefetch === false) return;
  configurePrefetch(typeof config.prefetch === 'object' ? config.prefetch : undefined);
  document.addEventListener('mouseover', (event) => {
    const link = (event.target as Element | null)?.closest?.('a[href^="/"]:not([data-native])');

    if (link) prefetchOnHover((link as HTMLAnchorElement).href);
  });
}

/**
 * Resumes a server-rendered page: indexes islands and state snapshots,
 * installs delegated listeners, and exposes the gui-agent bridge.
 * No component code executes until first interaction or agent call.
 */
export function boot(options: BootOptions = {}): JanuxClient {
  const registry = createClientRegistry();
  const proposals = new Map<string, Proposal>();
  const mount: MountContext = {
    registry,
    bus: createBus(),
    ctx: options.ctx ?? {},
    inflight: new Set(),
    onProposal: (proposal) => {
      proposals.set((proposal as Proposal).id, proposal as Proposal);
      document.dispatchEvent(new CustomEvent('janux:proposal', { detail: proposal }));
    },
    onAudit: (entry) => {
      options.onAudit?.(entry as AuditEntry);
      document.dispatchEvent(new CustomEvent('janux:audit', { detail: entry }));
    },
  };

  // Before anything can navigate: a navigation's markup carries the next
  // response's nonce, and this document's CSP only accepts the one it shipped with.
  captureNonce();
  Object.entries(options.islands ?? {}).forEach(([name, loader]) => {
    registry.loaders.set(name, loader);
  });
  (options.defs ?? []).forEach((def) => registerDef(registry, def));
  readSnapshots(mount);
  installI18n(mount.ctx);
  listen(mount, (work) => trackInflight(mount, work));
  if (options.glow) enableAgentGlow(options.glow === true ? {} : options.glow);
  const navigation = shellNavigationConfig();

  if (options.navigation ?? navigation.spa ?? true) installNavigation(mount, navigation);
  const bridge = createBridge(mount, proposals);
  const client: JanuxClient = {
    ...bridge,
    proposals,
    mount(id: string) {
      const root = document.querySelector(`janux-island[data-jx="${id}"]`);

      if (!root) throw new Error(`Janux: island "${id}" not found in the document`);

      return mountIsland(id, root, mount);
    },
    async navigate(url: string) {
      const nav = (window as any).navigation;
      const target = new URL(url, location.href).href;

      // Already there: same contract as clicking the page you are on — a no-op.
      // (Going through nav.navigate() would reject with the cancellation.)
      if (target === location.href) return;
      // Through the interceptor when the platform has it; direct SPA otherwise.
      if (nav?.navigate) await nav.navigate(target).finished;
      else await awaitTracked(mount, performNavigation(target, mount));
    },
  };

  if (typeof window !== 'undefined') (window as any).janux = client;
  if (options.webmcp !== false) installWebMCP(bridge);
  mountEagerIslands(mount).catch(reportIntentError);
  mountDocumentForeigns(mount).catch(reportIntentError);
  // The runtime can boot mid-stream (pages with suspense boundaries ship it
  // before the trailing chunks): content a later swap reveals may carry eager
  // islands this initial pass could not see.
  document.addEventListener('janux:unsuspense', () => {
    mountEagerIslands(mount).catch(reportIntentError);
  });

  return client;
}
