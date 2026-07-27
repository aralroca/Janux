import { createBus } from '../runtime/bus';
import type { ComponentDef } from '../define/types';
import type { ForeignDef } from '../interop';
import type { Proposal } from '../runtime/intents';
import { createBridge, type JanuxBridge } from './bridge';
import { listen } from './events';
import { mountDocumentForeigns, mountIsland, type MountContext } from './mount';
import { createClientRegistry, registerDef, type IslandLoader } from './registry';
import { enableAgentGlow, type GlowOptions } from './glow';
import { installI18n } from './i18n';
import type { NavigationConfig } from '../config';
import { mountEagerIslands, performNavigation } from './navigate';
import { configurePrefetch, prefetch } from './prefetch';
import { rescopeSpeculationRules } from './speculation';
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

export function shouldIntercept(event: any): boolean {
  if (!event.canIntercept || event.hashChange || event.downloadRequest || event.formData) return false;
  const destination = new URL(event.destination.url);

  if (destination.origin !== location.origin) return false;
  /*
   * The page we are already on. Diffing it against itself is not free: islands
   * are torn down and re-mounted against DOM the diff has just replaced, which
   * is how clicking "Playground" while on /playground emptied the editor. A
   * router has nothing to do here; `client.navigate()` still re-navigates
   * deliberately, because it does not come through this path.
   */
  if (destination.href === location.href) return false;
  // Query-only changes on the same path are shallow: islands read the query
  // reactively (urlState), so a filter/tab/dialog change never re-renders the
  // page. Cross-path navigations still get the SPA diff.
  if (destination.pathname === location.pathname && destination.search !== location.search) return false;
  // Prefer the precise source element; fall back to a recent data-native click.
  if (event.sourceElement) return !event.sourceElement.closest?.('[data-native]');
  const wasNative = Date.now() - nativeClickAt < 100;

  nativeClickAt = 0;

  return !wasNative;
}

/** `janux.config.ts`'s navigation section, shipped by the shell as a keyed script. */
function shellNavigationConfig(): NavigationConfig {
  const script = document.getElementById('jx-config');

  try {
    return JSON.parse(script?.textContent ?? '{}').navigation ?? {};
  } catch {
    return {};
  }
}

/**
 * Navigation API interception (Baseline 2026). Browsers without it keep
 * native MPA links — which already work — so there is no History fallback.
 */
function installNavigation(mount: MountContext, config: NavigationConfig): void {
  const nav = (window as any).navigation;
  const prefetching = config.prefetch !== false;

  configurePrefetch({ enabled: prefetching, ...(typeof config.prefetch === 'object' ? config.prefetch : {}) });
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element | null)?.closest?.('[data-native]')) nativeClickAt = Date.now();
    },
    true,
  );
  if (!nav) return; // No interception: the server's document-wide rules stand.
  nav.addEventListener('navigate', (event: any) => {
    if (!shouldIntercept(event)) return;
    event.intercept({
      scroll: 'after-transition',
      handler: () =>
        awaitTracked(mount, performNavigation(event.destination.url, mount, { signal: event.signal })),
    });
  });
  rescopeSpeculationRules(config);
  if (!prefetching) return;
  document.addEventListener('mouseover', (event) => {
    const link = (event.target as Element | null)?.closest?.('a[href^="/"]:not([data-native])');

    if (link) prefetch((link as HTMLAnchorElement).href);
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
  };

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

      // Through the interceptor when the platform has it; direct SPA otherwise.
      if (nav?.navigate) await nav.navigate(url).finished;
      else await awaitTracked(mount, performNavigation(new URL(url, location.href).href, mount));
    },
  };

  if (typeof window !== 'undefined') (window as any).janux = client;
  if (options.webmcp !== false) installWebMCP(bridge);
  mountEagerIslands(mount).catch(reportIntentError);
  mountDocumentForeigns(mount).catch(reportIntentError);

  return client;
}
