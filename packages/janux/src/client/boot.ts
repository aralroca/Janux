import { createBus } from '../runtime/bus';
import type { ComponentDef } from '../define/types';
import type { Proposal } from '../runtime/intents';
import { createBridge, type JanuxBridge } from './bridge';
import { mountIsland, type MountContext } from './mount';
import { createClientRegistry, registerDef, type IslandLoader } from './registry';
import { enableAgentGlow, type GlowOptions } from './glow';

export interface BootOptions {
  islands?: Record<string, IslandLoader>;
  defs?: ComponentDef[];
  ctx?: Record<string, unknown>;
  /** Highlight islands while an agent operates them. `true` or `{ duration }`. */
  glow?: boolean | GlowOptions;
}

export interface JanuxClient extends JanuxBridge {
  mount(id: string): Promise<unknown>;
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
  mount.inflight.add(work);
  work.catch(reportIntentError).finally(() => mount.inflight.delete(work));
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
  const bridge = createBridge(mount, proposals);
  const client: JanuxClient = {
    ...bridge,
    proposals,
    mount(id: string) {
      const root = document.querySelector(`janux-island[data-jx="${id}"]`);

      if (!root) throw new Error(`Janux: island "${id}" not found in the document`);

      return mountIsland(id, root, mount);
    },
  };

  if (typeof window !== 'undefined') (window as any).janux = client;

  return client;
}
