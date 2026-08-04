import { beforeAll, describe, expect, it } from 'bun:test';
import { createTestApp } from '@janux/testing';
import { appRoot } from './support/app';

/**
 * The shop demo's reason to exist: one cart with two faces. Humans get buttons
 * and instant execution; agents get typed tools where the monetary one
 * (checkout/pay, guard `confirm`) is never executed directly — it becomes a
 * Proposal a human settles through /_janux/approve. No model API key is needed
 * for any of this: the copilot island only reaches for one when it is used.
 */

let app: Awaited<ReturnType<typeof createTestApp>>;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  app = await createTestApp(appRoot('examples/shop'));
});

describe('examples/shop end to end', () => {
  it('serves a zero-JS landing that links into the shop', async () => {
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('Janux Shop');
    expect(html).toContain('zero JavaScript');
    expect(html).toContain('href="/shop"');
  });

  it('renders the catalog server-side, resolved from the api() source', async () => {
    const html = await (await app.fetch('/shop')).text();

    expect(html).toContain('<title>Janux Shop — demo</title>');
    expect(html).toContain('Blue Sneakers');
    expect(html).toContain('59.99€');
    expect(html).toContain('Red Backpack');
    expect(html).toContain('34.99€');
    expect(html).toContain('Green Hoodie');
    expect(html).toContain('45.99€');
    // The source resolved during SSR: no pending fallback, and the cart shipped empty.
    expect(html).not.toContain('Loading catalog');
    expect(html).toContain('Your cart is empty');
  });

  it('serves the dynamic order route as a static page with server data', async () => {
    const html = await (await app.fetch('/orders/abc123')).text();

    expect(html).toContain('<title>Order abc123 — Janux Shop</title>');
    expect(html).toContain('Order abc123');
    expect(html).toContain('paid');
    expect(html).toContain('href="/shop"');
  });

  it('exposes the whole cart as tools on the shop page, with checkout guarded', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest?path=/shop')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards).toEqual({
      'copilot.send': 'auto',
      'toasts.dismiss': 'auto',
      'cart.addItem': 'auto',
      'cart.changeQty': 'auto',
      'cart.removeItem': 'auto',
      'cart.applyCoupon': 'auto',
      'cart.clear': 'confirm',
      'cart.checkout': 'confirm',
      'api.shop.catalog': 'auto',
      'api.shop.orderStatus': 'auto',
      'api.shop.pay': 'confirm',
      'api.shop.saveCart': 'auto',
    });
    // An empty cart makes checkout not-ready: the manifest says so upfront.
    expect(manifest.tools.find((tool: any) => tool.name === 'cart.checkout').ready).toBe(false);
    expect(manifest.resources.map((entry: any) => entry.uri)).toContain('ui://cart');
    expect(manifest.routes).toContain('/orders/[id]');
  });

  it('scopes the manifest per page: the JS-less landing exposes only the api tools', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest?path=/')).json();
    const names = manifest.tools.map((tool: any) => tool.name);

    expect(names.filter((name: string) => name.startsWith('cart.'))).toEqual([]);
    expect(names).toContain('api.shop.pay');
  });

  it('agent-origin pay yields a Proposal — approve executes it exactly once', async () => {
    const proposed: any = (await (await post('/_janux/api/shop.pay', { total: 5999 }, { 'x-janux-origin': 'agent' })).json()) as any;

    expect(proposed.result.status).toBe('proposal');
    expect(proposed.result.tool).toBe('shop.pay');
    expect(proposed.result.orderId).toBeUndefined();

    const approved: any = await (await post('/_janux/approve', { id: proposed.result.id })).json();

    expect(approved.result.charged).toBe(5999);
    expect(approved.result.orderId).toMatch(/^ord_/);
    // The proposal is consumed: a replayed approval finds nothing to run.
    expect((await post('/_janux/approve', { id: proposed.result.id })).status).toBe(404);
  });

  it('human-origin pay executes directly: the click is the confirmation', async () => {
    const body: any = await (await post('/_janux/api/shop.pay', { total: 100 })).json();

    expect(body.result.status).toBeUndefined();
    expect(body.result.orderId).toMatch(/^ord_/);
    expect(body.result.charged).toBe(100);
  });
});
