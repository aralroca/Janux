import { describe, expect, it } from 'bun:test';
import { jsx, schema, str } from 'janux';
import { api } from './api';
import { createJanuxServer } from './server';

const apis = {
  greet: api({
    description: 'Greet a person',
    input: schema({ name: str() }),
    run: ({ input }) => `hola ${input.name}`,
  }),
  wipe: api({ description: 'Dangerous wipe', guard: 'confirm', run: () => 'wiped' }),
};

function server(extra: Record<string, unknown> = {}) {
  return createJanuxServer({
    title: 'demo',
    apis: { demo: apis },
    routes: {
      '/': () => jsx('main', { children: [jsx('h1', { children: 'Home' }), jsx('p', { children: 'Welcome to demo' })] }),
    },
    ...extra,
  });
}

async function rpc(target: ReturnType<typeof server>, method: string, params?: unknown, headers: Record<string, string> = {}) {
  const res = await target.fetch(
    new Request('http://x/_janux/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );

  return { status: res.status, body: res.status === 401 ? undefined : await res.json(), headers: res.headers };
}

describe('hosted MCP endpoint (/_janux/mcp)', () => {
  it('initializes statelessly', async () => {
    const { body } = await rpc(server(), 'initialize', {});

    expect(body.result.serverInfo.name).toBe('demo');
    expect(body.result.capabilities).toHaveProperty('tools');
  });

  it('lists api() tools with schemas and approval annotations', async () => {
    const { body } = await rpc(server(), 'tools/list');
    const names = body.result.tools.map((tool: any) => tool.name);

    expect(names).toContain('demo.greet');
    const wipe = body.result.tools.find((tool: any) => tool.name === 'demo.wipe');

    expect(wipe.annotations).toEqual({ requiresApproval: true });
  });

  it('calls a tool and returns its result as content', async () => {
    const { body } = await rpc(server(), 'tools/call', { name: 'demo.greet', arguments: { name: 'ada' } });

    expect(body.result.content[0].text).toBe('"hola ada"');
  });

  it('exposes pages as markdown resources', async () => {
    const target = server();
    const list = await rpc(target, 'resources/list');

    expect(list.body.result.resources.map((r: any) => r.uri)).toContain('janux://page/');
    const read = await rpc(target, 'resources/read', { uri: 'janux://page/' });

    expect(read.body.result.contents[0].text).toContain('# Home');
    expect(read.body.result.contents[0].text).toContain('Welcome to demo');
  });

  it('401s with WWW-Authenticate when auth is configured and the token is bad', async () => {
    const target = server({
      mcpAuth: { verify: (token: string) => (token === 'good' ? { sub: 'u1' } : null) },
    });
    const denied = await rpc(target, 'tools/list');

    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toContain('Bearer');
    const ok = await rpc(target, 'tools/list', undefined, { authorization: 'Bearer good' });

    expect(ok.status).toBe(200);
  });

  it('405s a GET from an MCP client, which asks for JSON and event streams', async () => {
    const res = await server().fetch(
      new Request('http://x/_janux/mcp', { headers: { accept: 'application/json, text/event-stream' } }),
    );

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  /** The dev banner prints this URL, so clicking it must explain itself rather than error. */
  it('answers a browser GET with the connect instructions and the tool list', async () => {
    const res = await server().fetch(new Request('http://x/_janux/mcp', { headers: { accept: 'text/html' } }));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('claude mcp add --transport http demo http://x/_janux/mcp');
    expect(html).toContain('demo.greet');
    expect(html).toContain('Greet a person');
  });

  /** The visitor's actual confusion: that a browsable URL means it stopped being JSON-RPC. */
  it('explains that POST is the protocol and GET is why they are seeing a page', async () => {
    const res = await server().fetch(new Request('http://x/_janux/mcp', { headers: { accept: 'text/html' } }));
    const html = await res.text();

    expect(html).toContain('JSON-RPC 2.0 in, JSON-RPC 2.0 out');
    expect(html).toContain('<code>POST</code>');
    expect(html).toContain('<code>GET</code>');
    expect(html).toContain('405');
    // A copy-pasteable proof, so nobody has to take the page's word for it.
    expect(html).toContain(`curl -s http://x/_janux/mcp`);
    expect(html).toContain('"method":"tools/list"');
  });

  it('serves the .md projection of a page', async () => {
    const res = await server().fetch(new Request('http://x/.md'));
    const alt = await server().fetch(new Request('http://x/index.md'));

    expect([res.status, alt.status]).toContain(200);
  });
});
