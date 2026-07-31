import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { component, source } from '../define/factories';
import { boot } from '../client/boot';
import { publishJanuxError } from './error-channel';
import { dismissDevOverlay } from './overlay';

/**
 * The overlay has to be subscribed before `boot()` mounts anything.
 *
 * `boot()` calls `mountEagerIslands` before it returns, so an eager island
 * whose source or effect throws publishes its chain *during* boot. While the
 * overlay was reached through a dynamic `import()`, that publish landed with
 * nobody listening — the startup failures this feature exists to explain were
 * the exact ones it missed. A static import installed synchronously is what
 * closes that window, and this is the test that keeps it closed.
 */

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:4321/shop' }));
afterAll(() => GlobalRegistrator.unregister());

const overlayText = () => document.querySelector('janux-dev-overlay')?.shadowRoot?.textContent ?? '';

beforeEach(() => {
  process.env.DEV = 'true';
  console.error = mock(() => undefined);
  globalThis.fetch = mock(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  document.body.innerHTML = '';
});

afterEach(() => {
  dismissDevOverlay();
  delete process.env.DEV;
});

describe('the overlay and boot ordering', () => {
  it('is listening the instant boot() returns, with no await in between', () => {
    boot({ navigation: false, webmcp: false });
    // Synchronous on purpose: an awaited assertion would pass even if the
    // overlay were installed a microtask later, which is the bug.
    publishJanuxError(new Error('catalog 503'), { kind: 'source', component: 'cart', name: 'catalog' });

    expect(overlayText()).toContain('catalog 503');
    expect(overlayText()).toContain('cart.catalog');
  });

  /** An eager island is mounted by boot() itself — its failure must be explained, not swallowed. */
  it('explains an eager island whose source throws during boot', async () => {
    const catalog = component({
      name: 'catalog',
      view: () => null,
      sources: {
        products: source({
          query: () => {
            throw new Error('catalog endpoint is down');
          },
        }),
      },
    });

    document.body.innerHTML = '<janux-island data-jx="catalog#default" data-jx-eager></janux-island>';
    const client = boot({ defs: [catalog], navigation: false, webmcp: false });

    await client.settled?.().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(overlayText()).toContain('catalog endpoint is down');
    expect(overlayText()).toContain('catalog.products');
  });

  /** Re-boot and HMR call boot() again; a second install would double every report. */
  it('installs once however many times boot() runs', () => {
    boot({ navigation: false, webmcp: false });
    boot({ navigation: false, webmcp: false });
    publishJanuxError(new Error('once'), { kind: 'source', component: 'cart', name: 'catalog' });

    expect(document.querySelectorAll('janux-dev-overlay')).toHaveLength(1);
    expect(overlayText()).not.toContain('more');
  });
});
