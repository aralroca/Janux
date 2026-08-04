import { describe, expect, it } from 'bun:test';
import { component, intent, jsx, renderToString, schema, source, str, int, list } from 'janux';
import { api } from './api';
import { htmlDocument } from './html-shell';
import { createJanuxServer, routeSpecifier } from './server';

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
      // Same-origin, as a browser on the app's own page reports it: the CSRF
      // guard refuses a mutating `/_janux/*` call that claims no origin at all.
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    }),
  );

describe('pages', () => {
  /**
   * Still zero JavaScript: the one script tag a static page carries is the
   * speculation rules' JSON, which the browser reads as data — no runtime, no
   * module, nothing to execute. It is also the page type that benefits most,
   * since every navigation away from it is a full document load.
   */
  it('serves static pages with ZERO JavaScript', async () => {
    const html = await (await get('/')).text();
    const scripts = [...html.matchAll(/<script[^>]*>/g)].map(([tag]) => tag);

    expect(html).toContain('<h1>Welcome</h1>');
    expect(scripts).toEqual(['<script type="speculationrules" key="jx-speculation" id="jx-speculation">']);
    expect(html).not.toContain('src=');
    expect(html).toContain('rel="janux-manifest"');
  });

  it('serves island pages with snapshots, island map and runtime', async () => {
    const html = await (await get('/shop')).text();

    expect(html).toContain('<janux-island key="cart#default" data-jx="cart#default">');
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

  it('run() and a dynamic guard see the caller origin', async () => {
    const originServer = createJanuxServer({
      routes: { '/': () => jsx('div', {}) },
      apis: {
        audit: {
          whoami: api({ description: 'Echo the caller origin', run: ({ origin }) => ({ origin }) }),
          save: api({
            description: 'Auto for humans, approval for agents',
            guard: ({ origin }) => (origin === 'agent' ? 'confirm' : 'auto'),
            run: ({ origin }) => `saved by ${origin}`,
          }),
        },
      },
    });
    const call = (path: string, headers: Record<string, string> = {}) =>
      originServer.fetch(
        new Request(`http://test${path}`, {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
        }),
      );

    expect((((await (await call('/_janux/api/audit.whoami')).json()) as any).result)).toEqual({ origin: 'human' });
    expect((((await (await call('/_janux/api/audit.whoami', { 'x-janux-origin': 'agent' })).json()) as any).result)).toEqual({ origin: 'agent' });

    // Same tool, two callers: straight through for the human…
    expect(((await (await call('/_janux/api/audit.save')).json()) as any).result).toBe('saved by human');
    // …a proposal for the agent.
    const proposed: any = ((await (await call('/_janux/api/audit.save', { 'x-janux-origin': 'agent' })).json()) as any).result;

    expect(proposed.status).toBe('proposal');

    // The proposer cannot settle its own proposal; a human can, and the
    // approved run still reports the AGENT origin — a human only authorized it.
    const selfApprove = await originServer.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: proposed.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-janux-origin': 'agent' },
      }),
    );

    expect(selfApprove.status).toBe(403);
    const whoProposed: any = ((await (await call('/_janux/api/audit.whoami', { 'x-janux-origin': 'agent' })).json()) as any).result;

    expect(whoProposed).toEqual({ origin: 'agent' });
    const approved = await originServer.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: proposed.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(((await approved.json()) as any).result).toBe('saved by agent');
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
      await loopServer.fetch(
        new Request('http://test/_janux/agent', { method: 'POST', body: '{}', headers: { 'sec-fetch-site': 'same-origin' } }),
      )
    ).json();

    expect(result.status).toBe('proposal');
    expect(result.tool).toBe('shop.charge');
    expect(charges).toEqual([]); // nothing ran without a human

    const approved: any = await (
      await loopServer.fetch(
        new Request('http://test/_janux/approve', {
          method: 'POST',
          body: JSON.stringify({ id: result.id }),
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
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

describe('staticExport', () => {
  it('omits the manifest link, because /_janux/* will not exist on a static host', async () => {
    const staticServer = createJanuxServer({
      routes: { '/': () => jsx('div', { children: jsx(cart as any, {}) }) },
      staticExport: true,
    });
    const html = await (await staticServer.fetch(new Request('http://test/'))).text();

    expect(html).not.toContain('janux-manifest');
    expect(html).toContain('<janux-island key="cart#default" data-jx="cart#default">'); // the page itself is intact
  });

  it('serves it as usual otherwise', async () => {
    const html = await (await get('/shop')).text();

    expect(html).toContain('rel="janux-manifest"');
  });
});

/**
 * Streaming SSR: the browser gets the head and every ready part of the page
 * while slow islands are still loading their sources — instead of staring at
 * the previous page until the last byte exists.
 */
describe('streaming pages', () => {
  async function readUntil(res: Response, marker: string): Promise<{ received: string; reader: ReadableStreamDefaultReader<Uint8Array> }> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';

    while (!received.includes(marker)) {
      const { value, done } = await reader.read();

      if (done) break;
      received += decoder.decode(value, { stream: true });
    }

    return { received, reader };
  }

  async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    let rest = '';

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }

    return rest;
  }

  it('flushes the head and earlier siblings before a slow island resolves', async () => {
    let release!: (rows: string[]) => void;
    const gate = new Promise<string[]>((resolve) => { release = resolve; });
    const slow = component({
      name: 'slow',
      sources: { rows: source({ query: () => gate }) },
      view: ({ sources }: any) => jsx('p', { children: `rows:${sources.rows.value.length}` }),
    });
    const streamServer = createJanuxServer({
      title: 'Streamed',
      routes: { '/': () => jsx('main', { children: [jsx('h1', { children: 'Fast' }), jsx(slow as any, {})] }) },
      runtimeUrl: '/_janux/client.js',
    });
    const res = await streamServer.fetch(new Request('http://test/'));
    const { received, reader } = await readUntil(res, '</h1>');

    expect(received).toContain('<title>Streamed</title>');
    expect(received).toContain('<h1>Fast</h1>');
    expect(received).not.toContain('rows:');

    release(['r1', 'r2']);
    const full = received + (await readRest(reader));

    expect(full).toContain('rows:2');
    expect(full).toContain('</html>');
  });

  it('streams a suspense fallback, then the boundary chunk before the epilogue', async () => {
    let release!: (rows: string[]) => void;
    const gate = new Promise<string[]>((resolve) => { release = resolve; });
    const slow = component({
      name: 'slow',
      sources: { rows: source({ query: () => gate }) },
      suspense: () => jsx('p', { children: 'loading' }),
      view: ({ sources }: any) => jsx('p', { children: `rows:${sources.rows.value.length}` }),
    });
    const streamServer = createJanuxServer({
      routes: { '/': () => jsx('main', { children: [jsx(slow as any, {}), jsx('h1', { children: 'After' })] }) },
      runtimeUrl: '/_janux/client.js',
      islandModules: { slow: '/islands/slow.js' },
    });
    const res = await streamServer.fetch(new Request('http://test/'));
    const { received, reader } = await readUntil(res, '</h1>');

    // The fallback holds the island's place and the page does not block on it.
    expect(received).toContain('data-jx-pending><p>loading</p></janux-island>');
    expect(received).toContain('<h1>After</h1>');
    expect(received).not.toContain('rows:');

    release(['r1', 'r2']);
    const full = received + (await readRest(reader));

    expect(full).toContain('<template id="jxu:slow#default"');
    expect(full).toContain('rows:2');
    // The interlude ships the runtime BEFORE the boundary chunks — the page is
    // interactive while they stream — and the classic-script kick exists
    // because a module script would defer until the stream ends.
    expect(full.indexOf('key="jx-runtime"')).toBeLessThan(full.indexOf('<template'));
    expect(full.indexOf('id="jx-runtime-eager"')).toBeLessThan(full.indexOf('<template'));
    // The boundary island's own snapshot can only exist after its sources
    // resolved: it travels in the tail, after its template.
    expect(full.indexOf('id="jxu:slow#default"')).toBeLessThan(full.indexOf('application/janux+state'));
    expect(full).toContain('"value":["r1","r2"]');
    // And nothing the interlude emitted is repeated by the tail.
    expect(full.split('key="jx-runtime"')).toHaveLength(2);
    expect(full.split('type="speculationrules"')).toHaveLength(2);
    expect(full.trimEnd()).toEndWith('</html>');
  });

  it('the streamed response is byte-identical to the buffered document', async () => {
    const result = await renderToString(jsx('div', { children: jsx(cart as any, {}) }));
    const expected = htmlDocument({
      html: result.html,
      snapshots: result.snapshots,
      islandNames: ['cart'],
      islandModules: { cart: '/islands/cart.js' },
      runtimeUrl: '/_janux/client.js',
      manifestUrl: `/_janux/manifest?path=${encodeURIComponent('/shop')}`,
    });

    expect(await (await get('/shop')).text()).toBe(expected);
  });

  it('a render that fails mid-stream reports in-page: janux:error script, closed document', async () => {
    const failing = () => {
      throw new Error('boom mid-render');
    };
    const streamServer = createJanuxServer({
      routes: { '/': () => jsx('main', { children: [jsx('h1', { children: 'Fast' }), jsx(failing as any, {})] }) },
    });
    const res = await streamServer.fetch(new Request('http://test/'));
    const html = await res.text();

    expect(res.status).toBe(200); // the status line was already on the wire
    expect(html).toContain('<h1>Fast</h1>');
    expect(html).toContain('janux:error');
    expect(html).toContain('boom mid-render');
    expect(html.trimEnd()).toEndWith('</html>');
  });
});

/**
 * A client navigation is not a first load: the document it is being diffed into
 * already has the app's CSS, and `keepRuntimeStyles` on the client keeps it
 * across the swap. Re-sending it is pure weight in front of the content — 27 KB
 * of the docs site's 95 KB page, which on a slow link is the difference between
 * seeing the new page and waiting for it.
 */
describe('inlined CSS on a client navigation', () => {
  const styled = createJanuxServer({
    routes: { '/': () => jsx('h1', { children: 'Home' }) },
    inlineStyles: ['body{color:red}'],
  });
  const load = (headers: Record<string, string> = {}) =>
    styled.fetch(new Request('http://test/', { headers }));

  it('inlines it on a first load', async () => {
    expect(await (await load()).text()).toContain('body{color:red}');
  });

  it('leaves it out when the client says it is navigating', async () => {
    const html = await (await load({ 'x-janux-navigation': '1' })).text();

    expect(html).not.toContain('body{color:red}');
    expect(html).toContain('<h1>Home</h1>');
  });
});

/**
 * Strict CSP end to end: the nonce the header names has to be the nonce every
 * tag in the document carries — the shell's, the renderer's, all of them — or
 * the page is blank. And it has to be a different nonce on every response.
 */
describe('strict CSP', () => {
  const routes = { '/': () => jsx('div', { children: jsx(cart as any, {}) }) };
  const inlineStyles = ['body{color:red}'];
  const tags = (html: string) => [...html.matchAll(/<(?:script|style)\b[^>]*>/g)].map(([tag]) => tag);

  it('emits the header and nonces every tag in the document with one line', async () => {
    const csped = createJanuxServer({ routes, inlineStyles, runtimeUrl: '/client.js', csp: true });
    const response = await csped.fetch(new Request('http://test/'));
    const policy = response.headers.get('content-security-policy')!;
    const nonce = /'nonce-([^']+)'/.exec(policy)![1]!;
    const emitted = tags(await response.text());

    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain('unsafe-inline');
    expect(emitted.length).toBeGreaterThan(3);
    expect(emitted.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);
  });

  it('never repeats a nonce across responses', async () => {
    const csped = createJanuxServer({ routes, csp: true });
    const nonceOf = async () =>
      (await csped.fetch(new Request('http://test/'))).headers.get('content-security-policy');

    expect(await nonceOf()).not.toBe(await nonceOf());
  });

  it('nonces the document but sets no header when the app owns the header', async () => {
    const csped = createJanuxServer({ routes, csp: { nonce: 'app-picked' } });
    const response = await csped.fetch(new Request('http://test/'));

    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(tags(await response.text()).filter((tag) => !tag.includes('nonce="app-picked"'))).toEqual([]);
  });

  // Zero regression: an app that never asked for CSP must get exactly the
  // document (and the headers) it got before the option existed.
  it('changes nothing for an app that never configured it', async () => {
    const plain = createJanuxServer({ routes, inlineStyles });
    const response = await plain.fetch(new Request('http://test/'));

    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(await response.text()).not.toContain('nonce');
  });
});

/**
 * First-class WebSockets: `fetch` stays Request→Response pure, so the server
 * exposes the seam the `Bun.serve` owner mounts instead — `serve(req, bun)`
 * decides the upgrade when the request matches `websocket.path`, and
 * `websocket` is the Bun-shaped handler object. `janux start` wires both.
 */
describe('first-class websockets', () => {
  const wsServer = createJanuxServer({
    routes: { '/': () => jsx('p', { children: 'page' }) },
    websocket: {
      path: '/live',
      data: (req) => ({ from: new URL(req.url).searchParams.get('u') }),
      message: () => undefined,
    },
  });

  it('426s the websocket path on the pure fetch — nobody upgraded', async () => {
    const res = await wsServer.fetch(new Request('http://test/live'));

    expect(res.status).toBe(426);
    expect(res.headers.get('upgrade')).toBe('websocket');
  });

  it('serve() upgrades a matching request and hands over the per-socket data', async () => {
    const upgraded: unknown[] = [];
    const bun = {
      upgrade: (_req: Request, init?: { data?: unknown }) => {
        upgraded.push(init?.data);

        return true;
      },
    };

    expect(await wsServer.serve(new Request('http://test/live?u=ana'), bun)).toBeUndefined();
    expect(upgraded).toEqual([{ from: 'ana' }]);
  });

  it('answers 426 itself when the runtime refuses the upgrade', async () => {
    const res = await wsServer.serve(new Request('http://test/live'), { upgrade: () => false });

    expect(res?.status).toBe(426);
  });

  it('serves every other path through the normal fetch', async () => {
    const bun = {
      upgrade: (): boolean => {
        throw new Error('must not upgrade');
      },
    };
    const res = await wsServer.serve(new Request('http://test/'), bun);

    expect(res?.status).toBe(200);
    expect(await res?.text()).toContain('page');
  });

  it('exposes exactly the Bun-shaped handlers', () => {
    expect(Object.keys(wsServer.websocket).sort()).toEqual(['close', 'drain', 'message', 'open']);
  });

  it('stays out of the way when no websocket is configured', async () => {
    expect((await server.serve(new Request('http://test/'), { upgrade: () => true }))?.status).toBe(200);
    expect((await server.fetch(new Request('http://test/ws'))).status).toBe(404);
    expect(server.websocket.message('socket' as never, 'frame')).toBeUndefined();
  });
});

/**
 * A filesystem path is not a module specifier. The router answers native paths,
 * and on Windows `C:\app\src\routes\index.tsx` parses as a URL whose scheme is
 * `c:` — Node's loader refuses it, so every page of an app served by `janux
 * start` fails to load. Bun is worse than an error: it resolves the path as a
 * bare specifier, quietly importing a second copy of the module.
 */
describe('the specifier a route is loaded by', () => {
  it('is a file URL, even for a path a URL parser reads as a scheme', () => {
    expect(new URL(routeSpecifier('C:\\app\\src\\routes\\index.tsx')).protocol).toBe('file:');
    expect(new URL(routeSpecifier('/app/src/routes/index.tsx')).protocol).toBe('file:');
  });
});
