import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, schema, str, int, list } from 'janux';
import { api } from './api';
import { createJanuxServer } from './server';

const orders = [
  { id: 'o1', status: 'pending' },
  { id: 'o2', status: 'paid' },
];

const shopApis = {
  searchOrders: api({
    description: 'Search orders by status',
    input: schema({ status: str() }),
    run: ({ input }) => orders.filter((order) => order.status === input.status),
  }),
  refundOrder: api({
    description: 'Refund an order. Irreversible.',
    input: schema({ orderId: str() }),
    guard: 'confirm',
    run: ({ input }) => ({ refunded: input.orderId }),
  }),
  internal: api({ guard: 'forbidden', run: () => 'secret' }),
};

const cart = component({
  name: 'cart',
  state: schema({ items: list({ id: str(), qty: int() }) }),
  intents: { add: intent({ input: schema({ id: str() }), run: ({ state, input }) => state.items.push({ id: input.id, qty: 1 }) }) },
  view: ({ state }: any) => jsx('p', { children: `${state.items.length} items` }),
});

function Landing() {
  return jsx('main', { children: jsx('h1', { children: 'Welcome' }) });
}

const server = createJanuxServer({
  routes: {
    '/': () => jsx(Landing as any, {}),
    '/shop': () => jsx('div', { children: jsx(cart as any, {}) }),
  },
  apis: { shop: shopApis },
  runtimeUrl: '/_janux/client.js',
  islandModules: { cart: '/islands/cart.js' },
});

const get = (path: string) => server.fetch(new Request(`http://test${path}`));
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );

describe('pages', () => {
  it('serves static pages with ZERO JavaScript', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('<h1>Welcome</h1>');
    expect(html).not.toContain('<script');
    expect(html).toContain('rel="janux-manifest"');
  });

  it('serves island pages with snapshots, island map and runtime', async () => {
    const html = await (await get('/shop')).text();

    expect(html).toContain('<janux-island data-jx="cart#default">');
    expect(html).toContain('data-uri="ui://cart#default"');
    expect(html).toContain('window.__JANUX_ISLANDS__={"cart":"/islands/cart.js"}');
    expect(html).toContain('src="/_janux/client.js"');
  });

  it('404s unknown routes', async () => {
    expect((await get('/nope')).status).toBe(404);
  });
});

describe('api endpoints', () => {
  it('runs api tools with validated input', async () => {
    const res = await post('/_janux/api/shop.searchOrders', { status: 'paid' });
    const body: any = await res.json();

    expect(body).toEqual({ ok: true, result: [{ id: 'o2', status: 'paid' }] });
  });

  it('rejects invalid input with 400', async () => {
    const res = await post('/_janux/api/shop.searchOrders', {});

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain('status: required');
  });

  it('human origin runs confirm tools directly', async () => {
    const body: any = await (await post('/_janux/api/shop.refundOrder', { orderId: 'o1' })).json();

    expect(body.result).toEqual({ refunded: 'o1' });
  });

  it('agent origin gets a proposal for confirm tools; approve executes it', async () => {
    const res = await post('/_janux/api/shop.refundOrder', { orderId: 'o1' }, { 'x-janux-origin': 'agent' });
    const proposal: any = ((await res.json()) as any).result;

    expect(proposal.status).toBe('proposal');
    const approved: any = await (await post('/_janux/approve', { id: proposal.id })).json();

    expect(approved.result).toEqual({ refunded: 'o1' });
    expect((await post('/_janux/approve', { id: proposal.id })).status).toBe(404);
  });

  /**
   * Regression: the copilot loop invokes api tools through `invokeTool`, which
   * bypassed the confirm gate the HTTP path implements — a `guard: 'confirm'`
   * charge ran unattended as soon as the model asked for it. Caught by a real
   * model eval saying "I've paid 5999 cents" for a tool that must be approved.
   */
  it('the agent LOOP also gets a proposal for confirm tools, not an execution', async () => {
    const charges: string[] = [];
    const loopServer = createJanuxServer({
      apis: {
        shop: {
          charge: api({
            description: 'Charge the card. Irreversible.',
            input: schema({ orderId: str() }),
            guard: 'confirm',
            run: ({ input }) => {
              charges.push(input.orderId);

              return { charged: input.orderId };
            },
          }),
        },
      },
      agent: {
        handle: async (_req, deps) =>
          new Response(JSON.stringify(await deps.invoke('api.shop.charge', { orderId: 'o9' })), {
            headers: { 'content-type': 'application/json' },
          }),
      },
    });
    const result: any = await (
      await loopServer.fetch(new Request('http://test/_janux/agent', { method: 'POST', body: '{}' }))
    ).json();

    expect(result.status).toBe('proposal');
    expect(result.tool).toBe('shop.charge');
    expect(charges).toEqual([]); // nothing ran without a human

    const approved: any = await (
      await loopServer.fetch(
        new Request('http://test/_janux/approve', {
          method: 'POST',
          body: JSON.stringify({ id: result.id }),
          headers: { 'content-type': 'application/json' },
        }),
      )
    ).json();

    expect(approved.result).toEqual({ charged: 'o9' });
    expect(charges).toEqual(['o9']);
  });

  it('agent origin cannot call forbidden tools', async () => {
    const res = await post('/_janux/api/shop.internal', {}, { 'x-janux-origin': 'agent' });

    expect(res.status).toBe(403);
  });
});

describe('route meta', () => {
  it('uses route-level meta for title and description', async () => {
    const fsServer = createJanuxServer({ routesDir: `${import.meta.dirname}/__fixtures__/routes` });
    const html = await (await fsServer.fetch(new Request('http://test/about'))).text();

    expect(html).toContain('<title>About — Janux fixture</title>');
    expect(html).toContain('<meta name="description" id="jx-description" content="Route-level metadata fixture.">');
    expect(html).toContain('<main>About page</main>');
  });
});

describe('title escaping (XSS regression)', () => {
  it('escapes route meta titles', async () => {
    const fsServer = createJanuxServer({ routesDir: `${import.meta.dirname}/__fixtures__/routes` });
    const html = await (await fsServer.fetch(new Request('http://test/evil'))).text();

    expect(html).not.toContain('</title><script>');
    expect(html).toContain('&lt;/title>&lt;script>');
  });
});

describe('manifest endpoint', () => {
  it('merges mounted islands and api tools per route', async () => {
    const manifest: any = await (await get('/_janux/manifest?path=/shop')).json();
    const toolNames = manifest.tools.map((tool: any) => tool.name);

    expect(manifest.resources.map((r: any) => r.uri)).toContain('ui://cart');
    expect(toolNames).toContain('cart.add');
    expect(toolNames).toContain('api.shop.searchOrders');
    expect(toolNames).not.toContain('api.shop.internal');
  });

  it('static routes expose only api tools', async () => {
    const manifest: any = await (await get('/_janux/manifest?path=/')).json();

    expect(manifest.resources).toEqual([]);
    expect(manifest.tools.every((tool: any) => tool.name.startsWith('api.'))).toBe(true);
  });
});
