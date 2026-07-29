import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { int, schema } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';
import {
  createModelContextPolyfill,
  installWebMCP,
  type ModelContextPolyfill,
  type WebMCPHandle,
} from './webmcp';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const counter = component({
  name: 'counter',
  state: schema({ n: int() }),
  intents: {
    inc: intent({ description: 'Increment', run: ({ state }) => (state.n += 1) }),
    reset: intent({ guard: 'confirm', run: ({ state }) => (state.n = 0) }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('output', { children: `n=${state.n}` }),
        jsx('button', { onClick: intents.inc, children: '+1' }),
      ],
    }),
});

const ROUTE_MANIFEST = {
  janux: '0.1.0',
  resources: [],
  tools: [
    {
      name: 'api.shop.pay',
      description: 'Pay the order',
      guard: 'confirm',
      input: { type: 'object', properties: { total: { type: 'number' } } },
    },
  ],
  events: [],
};

const originalFetch = globalThis.fetch;
let manifestTools = ROUTE_MANIFEST.tools;
const fetchMock = mock(async (input: any, init?: RequestInit) => {
  const url = String(input);

  if (url.startsWith('/_janux/manifest')) {
    return Response.json({ ...ROUTE_MANIFEST, tools: manifestTools });
  }
  if (url.startsWith('/_janux/api/')) return Response.json({ ok: true, result: 'paid' });

  return originalFetch(input, init);
});

/** What `htmlDocument` puts in every server-rendered page (a static export omits it). */
const MANIFEST_LINK = '<link rel="janux-manifest" id="jx-manifest" href="/_janux/manifest?path=%2F">';

async function serveAndBoot(): Promise<JanuxClient> {
  const { html, snapshots } = await renderToString(jsx(counter as any, {}), {
    initialState: { 'ui://counter#default': { n: 5 } },
  });
  const scripts = snapshots
    .map(
      (s) =>
        `<script type="application/janux+state" data-uri="${s.uri}">${JSON.stringify({ state: s.state, sources: s.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = MANIFEST_LINK + html + scripts;

  return boot({ defs: [counter], webmcp: false });
}

function polyfillOf(): ModelContextPolyfill {
  return (document as any).modelContext;
}

describe('WebMCP integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (document as any).modelContext;
    manifestTools = ROUTE_MANIFEST.tools;
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('polyfill: registers, lists, calls and honors AbortSignal', async () => {
    const context = createModelContextPolyfill();
    const controller = new AbortController();

    context.registerTool(
      { name: 'echo', description: 'Echo', execute: (input) => input },
      { signal: controller.signal },
    );
    expect(context.listTools().map((tool) => tool.name)).toEqual(['echo']);
    expect(await context.callTool('echo', { a: 1 })).toEqual({ a: 1 });

    controller.abort();
    expect(context.listTools()).toHaveLength(0);
    expect(context.callTool('echo')).rejects.toThrow('unknown tool');
  });

  it('polyfill: provideContext replaces the registered set', () => {
    const context = createModelContextPolyfill();

    context.registerTool({ name: 'old', execute: () => null });
    context.provideContext!({ tools: [{ name: 'next', execute: () => null }] });
    expect(context.listTools().map((tool) => tool.name)).toEqual(['next']);
  });

  it('auto-registers the built-in navigate tool alongside manifest tools', async () => {
    const client = await serveAndBoot();
    const handle = installWebMCP(client);

    await handle.sync();
    expect(polyfillOf().listTools().map((tool) => tool.name)).toContain('navigate');
  });

  it('an app tool named navigate makes the built-in step aside', async () => {
    manifestTools = [
      { name: 'navigate', description: 'App-owned nav', guard: 'auto', input: { type: 'object', properties: { total: { type: 'number' } } } },
    ];
    const client = await serveAndBoot();
    const handle = installWebMCP(client);

    await handle.sync();
    const navigate = polyfillOf().listTools().find((tool) => tool.name === 'navigate');

    expect(navigate?.description).toContain('App-owned nav');
  });

  it('registers route manifest tools plus live local tools, with sanitized names', async () => {
    const client = await serveAndBoot();

    await client.call('counter.inc'); // mounts the island → local manifest is live
    const handle = installWebMCP(client);

    await handle.sync();
    const names = polyfillOf()
      .listTools()
      .map((tool) => tool.name);

    expect(names).toContain('api_shop_pay');
    expect(names).toContain('counter_inc');
    expect(names).toContain('counter_reset');
    handle.dispose();
  });

  it('executes UI tools through the bridge and annotates confirm guards', async () => {
    const client = await serveAndBoot();

    await client.call('counter.inc');
    const handle = installWebMCP(client);

    await handle.sync();
    const result: any = await polyfillOf().callTool('counter_inc');

    await client.settled();
    expect(document.querySelector('output')!.textContent).toBe('n=7');
    expect(result.content[0].type).toBe('text');

    const reset = polyfillOf()
      .listTools()
      .find((tool) => tool.name === 'counter_reset')!;

    expect(reset.description).toContain('human must approve');
    handle.dispose();
  });

  it('executes api.* tools over HTTP with the agent origin header', async () => {
    const client = await serveAndBoot();
    const handle = installWebMCP(client);

    await handle.sync();
    const result: any = await polyfillOf().callTool('api_shop_pay', { total: 25 });

    // Unwrapped, like every other tool: api.* now rides the same bridge call,
    // so an agent sees the result itself instead of the {ok,result} envelope.
    expect(JSON.parse(result.content[0].text)).toBe('paid');
    const apiCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/_janux/api/'));

    expect(String(apiCall![0])).toBe('/_janux/api/shop.pay');
    expect((apiCall![1]!.headers as any)['x-janux-origin']).toBe('agent');
    handle.dispose();
  });

  it('re-syncs on SPA navigation without duplicating registrations', async () => {
    const client = await serveAndBoot();
    const handle = installWebMCP(client);

    await handle.sync();
    manifestTools = [{ ...ROUTE_MANIFEST.tools[0]!, name: 'api.shop.refund' }];
    document.dispatchEvent(
      new CustomEvent('janux:navigate', { detail: { phase: 'after', from: '/', to: '/next' } }),
    );
    await handle.sync();
    const names = polyfillOf()
      .listTools()
      .map((tool) => tool.name);

    expect(names).toContain('api_shop_refund');
    expect(names).not.toContain('api_shop_pay');
    handle.dispose();
  });

  it('boot installs WebMCP by default (0 config)', async () => {
    const { html } = await renderToString(jsx(counter as any, {}), {
      initialState: { 'ui://counter#default': { n: 1 } },
    });

    document.body.innerHTML = MANIFEST_LINK + html;
    boot({ defs: [counter] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(polyfillOf()).toBeDefined();
    expect(polyfillOf().polyfilled).toBe(true);
  });
});
