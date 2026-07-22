import { createBus } from '../runtime/bus';
import type { ComponentDef } from '../define/types';
import type { Proposal } from '../runtime/intents';
import { createBridge, type JanuxBridge } from './bridge';
import { mountIsland, type MountContext } from './mount';
import { createClientRegistry, registerDef, type IslandLoader } from './registry';
import { enableAgentGlow, type GlowOptions } from './glow';
import { mountEagerIslands, performNavigation } from './navigate';
import { prefetch } from './prefetch';
import { installWebMCP } from './webmcp';

export interface BootOptions {
  islands?: Record<string, IslandLoader>;
  defs?: ComponentDef[];
  ctx?: Record<string, unknown>;
  /** Highlight islands while an agent operates them. `true` or `{ duration }`. */
  glow?: boolean | GlowOptions;
  /** SPA navigation via the Navigation API + streamed DOM diff. Default: true. */
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

function markerTarget(
  event: Event,
  attr: string,
): { marker: string; root: Element; el: Element } | undefined {
  const el = (event.target as Element | null)?.closest?.(`[${attr}]`);
  const root = el?.closest('janux-island[data-jx]');

  if (!el || !root) return undefined;

  return { marker: el.getAttribute(attr)!, root, el };
}

function elementInput(el: Element): unknown {
  const raw = el.getAttribute('data-input');

  return raw ? JSON.parse(raw) : undefined;
}

async function invokeMarker(marker: string, root: Element, mount: MountContext, input?: unknown) {
  const [id = '', intentName = ''] = marker.split(':');
  const instance = await mountIsland(id, root, mount);

  return instance.intents[intentName]?.(input);
}

function formInput(form: HTMLFormElement): Record<string, unknown> {
  return Object.fromEntries(new FormData(form).entries());
}

function trackInflight(mount: MountContext, work: Promise<unknown>): void {
  awaitTracked(mount, work).catch(reportIntentError);
}

function listen(mount: MountContext): void {
  document.addEventListener('click', (event) => {
    const found = markerTarget(event, 'data-jxa');

    if (!found) return;
    event.preventDefault();
    trackInflight(mount, invokeMarker(found.marker, found.root, mount, elementInput(found.el)));
  });
  document.addEventListener('submit', (event) => {
    const found = markerTarget(event, 'data-jxform');

    if (!found) return;
    event.preventDefault();
    const input = formInput(event.target as HTMLFormElement);

    trackInflight(mount, invokeMarker(found.marker, found.root, mount, input));
  });
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

function shouldIntercept(event: any): boolean {
  if (!event.canIntercept || event.hashChange || event.downloadRequest || event.formData) return false;
  if (new URL(event.destination.url).origin !== location.origin) return false;
  // Prefer the precise source element; fall back to a recent data-native click.
  if (event.sourceElement) return !event.sourceElement.closest?.('[data-native]');
  const wasNative = Date.now() - nativeClickAt < 100;

  nativeClickAt = 0;

  return !wasNative;
}

/**
 * Navigation API interception (Baseline 2026). Browsers without it keep
 * native MPA links — which already work — so there is no History fallback.
 */
function installNavigation(mount: MountContext): void {
  const nav = (window as any).navigation;

  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element | null)?.closest?.('[data-native]')) nativeClickAt = Date.now();
    },
    true,
  );
  nav?.addEventListener('navigate', (event: any) => {
    if (!shouldIntercept(event)) return;
    event.intercept({
      scroll: 'after-transition',
      handler: () =>
        awaitTracked(mount, performNavigation(event.destination.url, mount, { signal: event.signal })),
    });
  });
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
  listen(mount);
  if (options.glow) enableAgentGlow(options.glow === true ? {} : options.glow);
  if (options.navigation !== false) installNavigation(mount);
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

  return client;
}
