import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createBus, createInstance, int, schema, store } from '../packages/janux/src/index';
import { cart as cartStore } from '../examples/cross-island-state/src/stores';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/cross-island-state exists to demonstrate: the shared-state
 * APIs across island boundaries. One `store()` read by five islands, a
 * `persist: 'local'` cart that survives a reload (persistStore), bus events
 * (`emits` + `on`) carrying a toast across islands, `onEvent()` re-querying a
 * server source per event, and `batch()` landing a three-product bundle as a
 * single repaint.
 */

const APP = 'examples/cross-island-state';
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const badge = (page: Page) => page.locator('.cart-badge output');
const lines = (page: Page) => page.locator('.cart-panel .lines li');
const paintsOf = (page: Page) => page.locator('.cart-panel').getAttribute('data-paints');

async function addProduct(page: Page, name: string, expectedCount: string): Promise<void> {
  await page.locator(`.product:has-text("${name}") button`).click();
  await page.waitForFunction(
    (count) => document.querySelector('.cart-badge output')?.textContent === count,
    expectedCount,
    { timeout: 5_000 },
  );
}

describe('examples/cross-island-state server side', () => {
  it('server-renders every island and the empty per-request cart', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    ['product-grid#default', 'cart-badge#default', 'cart-panel#default', 'toasts#default', 'inventory#default'].forEach(
      (id) => expect(html).toContain(`data-jx="${id}"`),
    );
    expect(html).toContain('Aurora Lamp');
    expect(html).toContain('Terra Mug');
    expect(html).toContain('Nimbus Chair');
    // The per-request store rendered fresh: no leak from any other request.
    expect(html).toContain('Your cart is empty.');
    // The inventory source resolved during SSR — no pending fallback shipped.
    expect(html).not.toContain('Checking stock…');
  });

  it('exposes the store and every intent on the agent surface', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const names = new Set(manifest.tools.map((tool: any) => tool.name));
    const cart = manifest.resources.find((entry: any) => entry.uri === 'store://cart');

    ['cart.add', 'cart.remove', 'cart.clear', 'product-grid.add', 'product-grid.addBundle', 'toasts.dismiss'].forEach(
      (name) => expect(names).toContain(name),
    );
    // The manifest lists the blast radius of a store mutation: its readers.
    ['ui://product-grid', 'ui://cart-badge', 'ui://cart-panel'].forEach((reader) =>
      expect(cart.readers).toContain(reader),
    );
    expect(manifest.events).toContain('cart.itemAdded');
  });

  it('createBus: two instances share a channel, the docs test-embedding pattern', async () => {
    const bus = createBus();
    const cart = createInstance(cartStore, { bus });
    const analytics = createInstance(
      store({
        name: 'analytics',
        state: schema({ adds: int() }),
        on: { 'cart.itemAdded': ({ state }) => (state.adds += 1) },
      }),
      { bus },
    );

    await cart.intents.add!({ id: 'lamp', name: 'Aurora Lamp', unitPrice: 3900 });
    await cart.intents.add!({ id: 'mug', name: 'Terra Mug', unitPrice: 1400 });
    expect(analytics.snapshot().adds).toBe(2);
    expect(cart.snapshot().items).toHaveLength(2);
  });
});

describe.skipIf(!BUILT)('examples/cross-island-state in the browser', () => {
  it('adding from the grid island updates the badge and the panel islands', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.cart-panel');
    expect(await badge(page).textContent()).toBe('0');

    await addProduct(page, 'Aurora Lamp', '1');
    await addProduct(page, 'Terra Mug', '2');
    // Island A wrote to the store; islands B and C followed without any wiring.
    expect(await lines(page).allTextContents()).toEqual(['Aurora Lamp×139.00€✕', 'Terra Mug×114.00€✕']);
    expect(await page.locator('.cart-panel .total output').textContent()).toBe('53.00€');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the cart survives a reload: persist "local" runs it through persistStore', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.cart-panel');
    await addProduct(page, 'Aurora Lamp', '1');
    // The write-back effect owns the storage key: wait for it, not a timer.
    await page.waitForFunction(() => localStorage.getItem('janux:store:cart')?.includes('lamp'), null, {
      timeout: 5_000,
    });

    await page.reload();
    // SSR ships the fresh per-request cart; the client rehydrates on boot.
    await page.waitForFunction(() => document.querySelector('.cart-badge output')?.textContent === '1', null, {
      timeout: 5_000,
    });
    expect(await lines(page).allTextContents()).toEqual(['Aurora Lamp×139.00€✕']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the bus event crosses islands: a toast appears and onEvent re-checks the server', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.inventory output');
    const checksBefore = Number(await page.locator('.inventory output').textContent());

    await addProduct(page, 'Terra Mug', '1');
    // The Toasts island heard 'cart.itemAdded' through its `on:` handler.
    await page.waitForSelector('.toast');
    expect(await page.locator('.toast').textContent()).toContain('Terra Mug added to the cart');
    // And the Inventory island's onEvent() policy re-queried the server.
    await page.waitForFunction(
      (before) => Number(document.querySelector('.inventory output')?.textContent) > before,
      checksBefore,
      { timeout: 5_000 },
    );

    await page.locator('.toast button').click();
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 5_000 });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('batch(): the three-product bundle lands as one repaint with correct state', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.cart-panel');
    // Two single adds establish the steady per-interaction repaint cost.
    await addProduct(page, 'Aurora Lamp', '1');
    const paintsAfterFirst = Number(await paintsOf(page));

    await addProduct(page, 'Aurora Lamp', '2');
    const paintsAfterSecond = Number(await paintsOf(page));
    const singleAddCost = paintsAfterSecond - paintsAfterFirst;

    await page.locator('.bundle').click();
    await page.waitForFunction(() => document.querySelector('.cart-badge output')?.textContent === '5', null, {
      timeout: 5_000,
    });
    // Three store intents, one batch(): the panel paid the price of ONE add,
    // not three — the flush count does not scale with the mutations inside.
    expect(Number(await paintsOf(page)) - paintsAfterSecond).toBe(singleAddCost);
    expect(await lines(page).allTextContents()).toEqual([
      'Aurora Lamp×3117.00€✕',
      'Terra Mug×114.00€✕',
      'Nimbus Chair×1129.00€✕',
    ]);
    expect(await page.locator('.cart-panel .total output').textContent()).toBe('260.00€');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
