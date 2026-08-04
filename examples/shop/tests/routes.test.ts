import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { createTestApp, mockApi, resetApiMocks, type TestApp } from '@janux/testing';
import { catalog } from '../src/server/shop.api';

const ROOT = join(import.meta.dirname, '..');

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp(ROOT);
});

afterAll(() => app.close());
afterEach(resetApiMocks);

describe('the landing page keeps the zero-JS promise', () => {
  it('renders its content and links no runtime', async () => {
    const page = await app.render('/');

    expect(page.status).toBe(200);
    expect(page.html).toContain('Janux Shop');
    expect(page.html).not.toContain('jx-runtime');
  });
});

describe('the shop page mounts the cart against the real api()', () => {
  it('server-renders the catalog the api returns', async () => {
    const page = await app.render('/shop');

    expect(page.html).toContain('Blue Sneakers');
    expect(page.html).toContain('Red Backpack');
  });

  /** The point of mocking at the api boundary: no per-test wiring, and the guard still runs. */
  it('renders whatever a mocked catalog returns instead', async () => {
    mockApi(catalog, () => ({ products: [{ id: 'p9', name: 'Mocked Lamp', price: 1000 }] }));
    const page = await app.render('/shop');

    expect(page.html).toContain('Mocked Lamp');
    expect(page.html).not.toContain('Blue Sneakers');
  });
});

describe('the page manifest is the agent surface', () => {
  it('advertises the cart intents and the api tools of the mounted page', async () => {
    const manifest = (await app.manifest('/shop')) as { tools: { name: string; guard: string }[] };
    const tools = new Map(manifest.tools.map((tool) => [tool.name, tool.guard]));

    expect([...tools.keys()]).toContain('cart.addItem');
    expect([...tools.keys()]).toContain('api.shop.catalog');
    // Checkout spends money: an agent proposes it, a human approves.
    expect(tools.get('cart.checkout')).toBe('confirm');
    // Sync and pure, so an agent proposal for it carries a shadow-run diff.
    expect(tools.get('cart.clear')).toBe('confirm');
  });
});
