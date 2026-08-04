import { islandIdsInDocument } from '../client/mount';
import { MANIFEST_HEADERS, routeManifestUrl } from '../client/prefetch';
import type { ClientRegistry } from '../client/registry';
import { currentModelContext } from '../client/webmcp';
import type { JanuxInstance } from '../runtime/instance';
import type { AuditEntry, Proposal } from '../runtime/intents';
import { DEVTOOLS_CSS } from './devtools-css';
import { diffRows, ownershipTree, sourceRows } from './devtools-data';
import { devtoolsMarkup, LAUNCHER, type DevtoolsModel, type DevtoolsTab, type ProposalRow, type SelectedIsland, type WebMCPView } from './devtools-view';
import { registeredWebMCPTools } from './webmcp-registry';

/**
 * The Janux devtools panel. Dev only — `boot()` reaches it through
 * `import.meta.env?.DEV` and the `devtools` boot flag, so a production build
 * never contains a byte of it (measured: `packages/janux-cli/src/bundle-size.test.ts`).
 *
 * Strictly an observer: it renders on demand from snapshots the runtime
 * already exposes and from DOM events the runtime already dispatches. It never
 * calls `settled()`, never subscribes to a signal, never invokes an intent —
 * the app behaves byte-for-byte the same with the panel open or closed.
 */

const HOST_TAG = 'janux-devtools';
const TIMELINE_CAP = 200;
const TAB_ORDER: DevtoolsTab[] = ['islands', 'timeline', 'manifest', 'webmcp', 'proposals'];

export interface DevToolsDeps {
  registry: ClientRegistry;
  proposals: Map<string, Proposal>;
}

/** The dev mirror is the roster — the native registry keeps its tools internal by design. */
function webmcpView(): WebMCPView {
  const context = currentModelContext() as { polyfilled?: boolean } | undefined;

  return {
    native: !!context && !context.polyfilled,
    tools: registeredWebMCPTools().map(({ name, description }) => ({ name, description })),
  };
}

function mountedView(item: JanuxInstance): SelectedIsland {
  const resource = item.resource() as { uri: string; state: unknown; schema?: unknown; sync: string };

  return {
    uri: resource.uri,
    state: JSON.stringify(resource.state, null, 2),
    schema: resource.schema === undefined ? undefined : JSON.stringify(resource.schema, null, 2),
    sync: resource.sync,
    sources: sourceRows(item),
  };
}

/** A not-yet-resumed island still has its SSR snapshot — schema-typed JSON, shown as-is. */
function selectedView(registry: ClientRegistry, id: string | undefined): SelectedIsland | undefined {
  if (!id) return undefined;
  const item = registry.mounted.get(id) ?? registry.stores.get(id);

  if (item) return mountedView(item);
  const snapshot = registry.snapshots.get(`ui://${id}`) as { state?: unknown } | undefined;

  if (!snapshot) return undefined;

  return { uri: `ui://${id}`, state: JSON.stringify(snapshot.state ?? snapshot, null, 2), sync: 'not resumed', sources: [] };
}

function proposalsView(proposals: Map<string, Proposal>): ProposalRow[] {
  return [...proposals.values()].map((proposal) => ({
    id: proposal.id,
    tool: proposal.tool,
    input: proposal.input === undefined ? '(no input)' : JSON.stringify(proposal.input, null, 2),
    rows: proposal.diff && diffRows(proposal.diff),
  }));
}

/** `boot()` runs again on re-boot and on HMR; installing twice would double every listener. */
let installed: (() => void) | undefined;
let host: HTMLElement | undefined;

export function installDevTools(deps: DevToolsDeps): () => void {
  // A disconnected host means its document is gone (HMR swap, a torn-down test
  // document) and every listener died with it: reinstall fresh, never return a
  // dead handle.
  if (installed && host?.isConnected) return installed;
  installed?.();
  const element = document.createElement(HOST_TAG);
  const root = element.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const container = document.createElement('div');
  const controller = new AbortController();
  const { signal } = controller;
  const timeline: AuditEntry[] = [];
  const state = { open: false, tab: 'islands' as DevtoolsTab, selectedId: undefined as string | undefined, manifest: undefined as string | undefined };
  let renderQueued = false;

  const model = (): DevtoolsModel => ({
    ...state,
    tree: ownershipTree(deps.registry, islandIdsInDocument()),
    selected: selectedView(deps.registry, state.selectedId),
    timeline,
    webmcp: webmcpView(),
    proposals: proposalsView(deps.proposals),
  });

  /** The focused control names itself via its `data-jxdt-*` attribute; re-focus it after a re-render. */
  const focusSelector = (): string | undefined => {
    const active = root.activeElement;
    const name = active?.getAttributeNames().find((attribute) => attribute.startsWith('data-jxdt-'));
    const value = name && active!.getAttribute(name);

    // CSS.escape: store names and hand-authored data-jx values are not sanitized anywhere.
    return name ? (value ? `[${name}="${CSS.escape(value)}"]` : `[${name}]`) : undefined;
  };

  const render = (target = focusSelector()): void => {
    container.innerHTML = state.open ? devtoolsMarkup(model()) : LAUNCHER;
    if (target) (root.querySelector(target) as HTMLElement | null)?.focus();
  };

  /** Coalesces event bursts (one intent storm = one paint); a microtask is not a subscription. */
  const scheduleRender = (): void => {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      if (state.open) render();
    });
  };

  const loadManifest = async (): Promise<void> => {
    const url = routeManifestUrl(location.pathname);

    try {
      state.manifest = url
        ? JSON.stringify(await (await fetch(url, { headers: MANIFEST_HEADERS })).json(), null, 2)
        : 'This page advertises no manifest (static export?).';
    } catch {
      state.manifest = 'Manifest unreachable — is `janux dev` running?';
    }
    if (state.open && state.tab === 'manifest') render();
  };

  const setTab = (tab: DevtoolsTab): void => {
    state.tab = tab;
    if (tab === 'manifest' && state.manifest === undefined) loadManifest().catch(() => undefined);
    render(`[data-jxdt-tab="${tab}"]`);
  };

  const toggle = (open: boolean): void => {
    state.open = open;
    render(open ? `[data-jxdt-tab="${state.tab}"]` : '[data-jxdt-toggle]');
  };

  const onShadowClick = (event: Event): void => {
    const target = event.target as Element;
    const tab = target.closest('[data-jxdt-tab]')?.getAttribute('data-jxdt-tab');
    const node = target.closest('[data-jxdt-node]')?.getAttribute('data-jxdt-node');

    if (target.closest('[data-jxdt-toggle]')) return toggle(true);
    if (target.closest('[data-jxdt-close]')) return toggle(false);
    if (target.closest('[data-jxdt-refresh]')) {
      loadManifest().catch(() => undefined);

      return;
    }
    if (tab) return setTab(tab as DevtoolsTab);
    if (node) {
      state.selectedId = node;
      render(`[data-jxdt-node="${CSS.escape(node)}"]`);
    }
  };

  /** Roving tabs: arrows move focus AND selection, per the tabs pattern. */
  const onShadowKeydown = (event: Event): void => {
    const { key, target } = event as KeyboardEvent & { target: Element };

    if (!(target as Element).closest?.('[role="tablist"]')) return;
    const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    const jump = key === 'Home' ? 0 : key === 'End' ? TAB_ORDER.length - 1 : undefined;

    if (!step && jump === undefined) return;
    event.preventDefault();
    setTab(TAB_ORDER[jump ?? (TAB_ORDER.indexOf(state.tab) + step + TAB_ORDER.length) % TAB_ORDER.length]!);
  };

  const onKeydown = (event: Event): void => {
    const { key, code, altKey, shiftKey } = event as KeyboardEvent;

    // `code`, not `key`: macOS composes Option+Shift+J into 'Ô' and the shortcut would never fire.
    if (altKey && shiftKey && code === 'KeyJ') toggle(!state.open);
    else if (key === 'Escape' && state.open) toggle(false);
  };

  const onAudit = (event: Event): void => {
    timeline.push((event as CustomEvent<AuditEntry>).detail);
    if (timeline.length > TIMELINE_CAP) timeline.shift();
    scheduleRender();
  };

  const rerender = (): void => {
    // The navigation diff replaces the body wholesale and takes the host with it.
    if (!element.isConnected) document.body.append(element);
    scheduleRender();
  };

  const onNavigate = (event: Event): void => {
    if ((event as CustomEvent).detail?.phase === 'after') rerender();
  };

  document.addEventListener('keydown', onKeydown, { signal });
  document.addEventListener('janux:audit', onAudit, { signal });
  document.addEventListener('janux:proposal', rerender, { signal });
  // Settlements: approvals surface as janux:tool-call, rejections as the dev-only mirror event.
  document.addEventListener('janux:tool-call', rerender, { signal });
  document.addEventListener('janux:proposal-settled', rerender, { signal });
  document.addEventListener('janux:navigate', onNavigate, { signal });
  document.addEventListener('janux:unsuspense', rerender, { signal });
  root.addEventListener('click', onShadowClick, { signal });
  root.addEventListener('keydown', onShadowKeydown, { signal });
  style.textContent = DEVTOOLS_CSS;
  root.append(style, container);
  document.body.append(element);
  render();
  host = element;
  installed = () => {
    installed = undefined;
    host = undefined;
    controller.abort();
    element.remove();
  };

  return installed;
}
