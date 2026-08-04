import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { JanuxInstance } from '../runtime/instance';
import type { Proposal } from '../runtime/intents';
import { createClientRegistry, type ClientRegistry } from '../client/registry';
import { installDevTools } from './devtools';

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:4321/shop' }));
afterAll(() => GlobalRegistrator.unregister());

const instance = (uri: string, state: Record<string, unknown> = {}) =>
  ({ uri, sources: {}, resource: () => ({ uri, state, sync: 'idle' }) }) as unknown as JanuxInstance;

let registry: ClientRegistry;
let proposals: Map<string, Proposal>;
let uninstall: () => void;

const shadow = () => document.querySelector('janux-devtools')!.shadowRoot!;

const text = () => shadow().textContent ?? '';

const press = (key: string, init: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

// macOS composes Option+Shift+J into 'Ô' in `key`, so the shortcut matches on `code`.
const open = () => press('Ô', { code: 'KeyJ', altKey: true, shiftKey: true });

const click = (selector: string) => (shadow().querySelector(selector) as HTMLElement).click();

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  // What htmlDocument puts in every served page; routeManifestUrl treats its absence as "don't ask".
  document.body.innerHTML = '<link rel="janux-manifest" id="jx-manifest" href="/_janux/manifest?path=%2Fshop">';
  registry = createClientRegistry();
  registry.mounted.set('Cart#default', instance('ui://Cart#default', { items: ['p1'] }));
  proposals = new Map();
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify({ tools: [{ name: 'cart.add' }] }), { headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
  uninstall = installDevTools({ registry, proposals });
});

afterEach(() => {
  uninstall();
});

describe('the devtools panel', () => {
  it('installs collapsed: a launcher, no panel, exactly once', () => {
    installDevTools({ registry, proposals });

    expect(document.querySelectorAll('janux-devtools')).toHaveLength(1);
    expect(shadow().querySelector('[data-jxdt-toggle]')).not.toBeNull();
    expect(shadow().querySelector('[role="tablist"]')).toBeNull();
  });

  it('opens with Alt+Shift+J showing the island tree, and Escape closes it back to the launcher', () => {
    open();

    expect(shadow().querySelector('[role="tablist"]')).not.toBeNull();
    expect(text()).toContain('Cart');

    press('Escape');

    expect(shadow().querySelector('[role="tablist"]')).toBeNull();
  });

  it('shows the schema-typed state of the island the keyboard user selects', () => {
    open();
    click('[data-jxdt-node="Cart#default"]');

    expect(text()).toContain('"items"');
    expect(text()).toContain('"p1"');
  });

  it('moves between tabs with the arrow keys, selection following focus', () => {
    open();
    const tablist = shadow().querySelector('[role="tablist"]')!;

    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));

    expect(shadow().querySelector('[data-jxdt-tab="timeline"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('records every janux:audit entry and shows guard, origin and outcome on the timeline', async () => {
    open();
    click('[data-jxdt-tab="timeline"]');
    document.dispatchEvent(
      new CustomEvent('janux:audit', {
        detail: { tool: 'cart.add', origin: 'human', guard: 'auto', input: {}, ok: true, at: Date.now() },
      }),
    );
    await settle();

    expect(text()).toContain('cart.add');
    expect(text()).toContain('human');
    expect(text()).toContain('auto');
    expect(text()).toContain('ok');
  });

  it('shows a pending proposal with its visual diff the moment janux:proposal fires', async () => {
    const proposal: Proposal = {
      id: 'p-1',
      tool: 'cart.checkout',
      input: { pay: true },
      diff: { before: { items: ['p1'] }, after: { items: [] } },
      execute: async () => undefined,
    };

    open();
    click('[data-jxdt-tab="proposals"]');
    proposals.set(proposal.id, proposal);
    document.dispatchEvent(new CustomEvent('janux:proposal', { detail: proposal }));
    await settle();

    expect(text()).toContain('cart.checkout');
    expect(text()).toContain('["p1"]');
    expect(shadow().querySelector('[data-jxdt-diff-changed]')).not.toBeNull();
  });

  it('drops a settled proposal the moment the bridge reports it', async () => {
    const proposal: Proposal = { id: 'p-2', tool: 'cart.clear', input: {}, execute: async () => undefined };

    open();
    click('[data-jxdt-tab="proposals"]');
    proposals.set(proposal.id, proposal);
    document.dispatchEvent(new CustomEvent('janux:proposal', { detail: proposal }));
    await settle();

    expect(text()).toContain('cart.clear');

    proposals.delete(proposal.id);
    document.dispatchEvent(new CustomEvent('janux:proposal-settled', { detail: proposal.id }));
    await settle();

    expect(text()).toContain('No pending proposals');
  });

  /** Approvals surface as janux:tool-call (local and remote); the tab must follow them too. */
  it('re-renders on janux:tool-call, so an approved proposal leaves the tab', async () => {
    const proposal: Proposal = { id: 'p-3', tool: 'cart.clear', input: {}, execute: async () => undefined };

    open();
    click('[data-jxdt-tab="proposals"]');
    proposals.set(proposal.id, proposal);
    document.dispatchEvent(new CustomEvent('janux:proposal', { detail: proposal }));
    await settle();
    proposals.delete(proposal.id);
    document.dispatchEvent(new CustomEvent('janux:tool-call', { detail: { tool: 'cart.clear', phase: 'ok' } }));
    await settle();

    expect(text()).toContain('No pending proposals');
  });

  /** Store names and hand-authored data-jx values are not sanitized; selectors must survive them. */
  it('inspects a store whose name would break an unescaped selector', () => {
    registry.stores.set('bad"store', instance('store://bad"store', { theme: 'dark' }));
    open();
    click('[data-jxdt-node^="bad"]');

    expect(text()).toContain('"theme"');
    expect(text()).toContain('"dark"');
  });

  it('fetches the manifest as the agent sees it when that tab opens', async () => {
    open();
    click('[data-jxdt-tab="manifest"]');
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledWith('/_janux/manifest?path=%2Fshop', { headers: { accept: 'application/json' } });
    expect(text()).toContain('cart.add');
  });

  it('re-reads the tree after an SPA navigation, following the boot resync', async () => {
    open();
    registry.mounted.set('Toasts#default', instance('ui://Toasts#default'));
    document.dispatchEvent(new CustomEvent('janux:navigate', { detail: { phase: 'after' } }));
    await settle();

    expect(text()).toContain('Toasts');
  });

  /** The navigation diff replaces the body wholesale; the panel must outlive the swap. */
  it('re-attaches its host after a navigation tore the body down', async () => {
    open();
    document.body.innerHTML = '';
    document.dispatchEvent(new CustomEvent('janux:navigate', { detail: { phase: 'after' } }));
    await settle();

    expect(document.querySelector('janux-devtools')).not.toBeNull();
    expect(text()).toContain('Cart');
  });

  /** Lazy islands: server-rendered, snapshot shipped, not yet resumed — still visible and inspectable. */
  it('lists a not-yet-resumed DOM island and shows its SSR snapshot on selection', () => {
    uninstall();
    registry.mounted.clear();
    registry.snapshots.set('ui://toasts#default', { state: { queue: ['hello'] } });
    document.body.innerHTML = '<janux-island data-jx="toasts#default"></janux-island>';
    uninstall = installDevTools({ registry, proposals });
    open();

    expect(text()).toContain('toasts');
    expect(text()).toContain('not resumed');

    click('[data-jxdt-node="toasts#default"]');

    expect(text()).toContain('"queue"');
    expect(text()).toContain('"hello"');
  });

  it('leaves the document clean once uninstalled', () => {
    uninstall();

    expect(document.querySelector('janux-devtools')).toBeNull();

    document.dispatchEvent(new CustomEvent('janux:audit', { detail: { tool: 'x', origin: 'human', guard: 'auto', input: {}, ok: true, at: 0 } }));

    expect(document.querySelector('janux-devtools')).toBeNull();
  });
});
