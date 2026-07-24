import { describe, expect, it } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { jsx, schema, str } from 'janux';

/**
 * The two pages that describe the surface an outside agent sees:
 * recipes/external-mcp-clients.md (the hosted /_janux/mcp endpoint, .md page
 * projection, llms.txt) and recipes/debugging-webmcp.md (name sanitization and
 * what a confirm-guarded tool looks like in a log). Every claim below is one a
 * reader would otherwise take on faith.
 */

const server = () =>
  createJanuxServer({
    title: 'demo',
    llmsTxt: { description: 'A demo app.' },
    routes: {
      '/': () => jsx('main', { children: jsx('h1', { children: 'Home' }) }),
      '/pricing': () => jsx('main', { children: [jsx('h1', { children: 'Pricing' }), jsx('p', { children: 'Cheap.' })] }),
    },
    apis: {
      shop: {
        catalog: api({ description: 'List products', run: () => ({ products: [] }) }),
        pay: api({ description: 'Charge the card', input: schema({ total: str() }), guard: 'confirm', run: () => ({ ok: true }) }),
      },
    },
  });

const rpc = async (method: string, params?: unknown) => {
  const response = await server().fetch(
    new Request('http://test/_janux/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  return (await response.json()) as any;
};

describe('recipes/external-mcp-clients.md', () => {
  it('serves a real MCP tools/list with schemas and the approval annotation', async () => {
    const body = await rpc('tools/list');
    const names = body.result.tools.map((tool: any) => tool.name).sort();
    const pay = body.result.tools.find((tool: any) => tool.name === 'shop.pay');

    expect(names).toEqual(['shop.catalog', 'shop.pay']);
    expect(pay.annotations).toEqual({ requiresApproval: true });
    expect(pay.inputSchema).toBeDefined();
  });

  it('a confirm-guarded tools/call answers with a proposal instead of executing', async () => {
    const body = await rpc('tools/call', { name: 'shop.pay', arguments: { total: '2500' } });

    expect(JSON.parse(body.result.content[0].text)).toMatchObject({ status: 'proposal', tool: 'shop.pay' });
  });

  it('lists every page as a janux://page resource', async () => {
    const body = await rpc('resources/list');
    const uris = body.result.resources.map((resource: any) => resource.uri).sort();

    expect(uris).toEqual(['janux://page/', 'janux://page/pricing']);
  });

  it('projects a page as markdown over plain HTTP with the .md suffix', async () => {
    const response = await server().fetch(new Request('http://test/pricing.md'));
    const markdown = await response.text();

    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(markdown).toContain('Pricing');
    expect(markdown).not.toContain('<h1>');
  });

  it('llms.txt indexes pages and tools, marking the approval-gated one', async () => {
    const text = await (await server().fetch(new Request('http://test/llms.txt'))).text();

    expect(text).toContain('/pricing');
    expect(text).toContain('shop.catalog');
    expect(text.toLowerCase()).toContain('approval');
  });
});

describe('recipes/debugging-webmcp.md', () => {
  /**
   * The page tells you to check `document.modelContext.polyfilled` in the
   * console and promises the polyfill adds listTools()/callTool() for
   * automation. (Name sanitization — counter_inc, api_shop_pay — is asserted by
   * the framework's own webmcp.test.ts.)
   */
  it('the polyfill identifies itself and exposes the automation pair', async () => {
    const { GlobalRegistrator } = await import('@happy-dom/global-registrator');

    GlobalRegistrator.register({ url: 'https://app.test/' });
    const { createModelContextPolyfill } = await import('janux/client');
    const context = createModelContextPolyfill();

    expect(context.polyfilled).toBe(true);
    const controller = new AbortController();

    context.registerTool({
      name: 'echo',
      description: 'Echo. Returns a proposal a human must approve.',
      inputSchema: { type: 'object' },
      execute: async (input: any) => ({ echoed: input.value }),
    } as any, { signal: controller.signal });

    expect(context.listTools().map((tool) => tool.name)).toEqual(['echo']);
    expect(await context.callTool('echo', { value: 'hi' })).toEqual({ echoed: 'hi' });
    expect(context.listTools()[0]!.description).toContain('proposal a human must approve');

    // Unregistering is the WebMCP way: abort the signal you registered with.
    controller.abort();

    expect(context.listTools()).toHaveLength(0);
    GlobalRegistrator.unregister();
  });
});
