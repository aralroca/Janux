import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { boot } from '../client/boot';
import { createClientRegistry } from '../client/registry';
import { installDevTools } from './devtools';

/**
 * The panel is dev-only and on by default there, opted out with
 * `devtools: false` — so no app ever carries the flag (or a single byte of
 * panel) into its shipped bundle. `boot()` reaches it through
 * `import.meta.env?.DEV`, the same guard the bundle-size test measures.
 */

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:4321/shop' }));
afterAll(() => GlobalRegistrator.unregister());

beforeEach(() => {
  process.env.DEV = 'true';
  console.error = mock(() => undefined);
  globalThis.fetch = mock(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  document.body.innerHTML = '';
});

afterEach(() => {
  // installDevTools returns the active uninstaller when already installed.
  installDevTools({ registry: createClientRegistry(), proposals: new Map() })();
  delete process.env.DEV;
});

describe('devtools and boot', () => {
  it('installs the launcher by default in dev', () => {
    boot({ navigation: false, webmcp: false });

    expect(document.querySelector('janux-devtools')).not.toBeNull();
    expect(document.querySelector('janux-devtools')!.shadowRoot!.querySelector('[data-jxdt-toggle]')).not.toBeNull();
  });

  it('stays out entirely when the app opts out', () => {
    boot({ devtools: false, navigation: false, webmcp: false });

    expect(document.querySelector('janux-devtools')).toBeNull();
  });

  it('installs once however many times boot() runs', () => {
    boot({ navigation: false, webmcp: false });
    boot({ navigation: false, webmcp: false });

    expect(document.querySelectorAll('janux-devtools')).toHaveLength(1);
  });

  /** `reject()` is a bare Map delete; in dev it must still tell the panel the proposal settled. */
  it('announces a rejected proposal so the panel can drop it', () => {
    const client = boot({ navigation: false, webmcp: false });
    const settled: unknown[] = [];

    client.proposals.set('p-1', { id: 'p-1', tool: 'cart.clear', input: {}, execute: async () => undefined });
    document.addEventListener('janux:proposal-settled', (event) => settled.push((event as CustomEvent).detail), { once: true });
    client.reject('p-1');

    expect(settled).toEqual(['p-1']);
  });
});
