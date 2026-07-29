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

  it('serves inputSchema as standard JSON Schema, not the internal JxType', async () => {
    const { body } = await rpc(server(), 'tools/list');
    const greet = body.result.tools.find((tool: any) => tool.name === 'demo.greet');

    expect(greet.inputSchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
    expect(greet.inputSchema).not.toHaveProperty('kind');
    expect(greet.inputSchema).not.toHaveProperty('flags');
    expect(greet.inputSchema).not.toHaveProperty('shape');
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

const META = 'io.modelcontextprotocol/';
const modernMeta = {
  [`${META}protocolVersion`]: '2026-07-28',
  [`${META}clientInfo`]: { name: 'test-client', version: '1' },
  [`${META}clientCapabilities`]: {},
};

function modernHeaders(method: string, name?: string) {
  return {
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
    ...(name ? { 'mcp-name': name } : {}),
  };
}

describe('hosted MCP endpoint — 2026-07-28 modern era', () => {
  it('answers server/discover with versions, capabilities and identity', async () => {
    const { body } = await rpc(server(), 'server/discover', { _meta: modernMeta }, modernHeaders('server/discover'));

    expect(body.result.supportedVersions).toEqual(['2026-07-28', '2025-06-18']);
    expect(body.result.capabilities).toHaveProperty('tools');
    expect(body.result.capabilities).toHaveProperty('resources');
    expect(body.result._meta[`${META}serverInfo`].name).toBe('demo');
  });

  it('serves a modern tools/list without any handshake and marks it cacheable', async () => {
    const { status, body } = await rpc(
      server(),
      'tools/list',
      { _meta: modernMeta },
      modernHeaders('tools/list'),
    );

    expect(status).toBe(200);
    expect(body.result.tools.map((tool: any) => tool.name)).toContain('demo.greet');
    const greet = body.result.tools.find((tool: any) => tool.name === 'demo.greet');

    expect(greet.inputSchema.type).toBe('object');
    expect(greet.inputSchema).not.toHaveProperty('kind');
    expect(body.result.ttlMs).toBeGreaterThan(0);
    expect(body.result.cacheScope).toBe('public');
    expect(body.result.resultType).toBe('complete');
    expect(body.result._meta[`${META}serverInfo`].name).toBe('demo');
  });

  it('marks results private when the endpoint requires auth', async () => {
    const target = server({ mcpAuth: { verify: (token: string) => (token === 'good' ? { sub: 'u1' } : null) } });
    const { body } = await rpc(target, 'tools/list', { _meta: modernMeta }, {
      ...modernHeaders('tools/list'),
      authorization: 'Bearer good',
    });

    expect(body.result.cacheScope).toBe('private');
  });

  it('rejects an unsupported modern version with -32022 and the supported list', async () => {
    const meta = { ...modernMeta, [`${META}protocolVersion`]: '2099-01-01' };
    const { status, body } = await rpc(server(), 'tools/list', { _meta: meta }, {
      'mcp-protocol-version': '2099-01-01',
      'mcp-method': 'tools/list',
    });

    expect(status).toBe(400);
    expect(body.error.code).toBe(-32022);
    expect(body.error.data.supported).toContain('2026-07-28');
    expect(body.error.data.requested).toBe('2099-01-01');
  });

  it('rejects a header/body mismatch with -32020', async () => {
    const mismatchedMethod = await rpc(server(), 'tools/list', { _meta: modernMeta }, modernHeaders('resources/list'));

    expect(mismatchedMethod.status).toBe(400);
    expect(mismatchedMethod.body.error.code).toBe(-32020);

    const missingHeader = await rpc(server(), 'tools/list', { _meta: modernMeta });

    expect(missingHeader.status).toBe(400);
    expect(missingHeader.body.error.code).toBe(-32020);
  });

  it('requires Mcp-Name on tools/call and decodes the Base64 sentinel', async () => {
    const params = { _meta: modernMeta, name: 'demo.greet', arguments: { name: 'ada' } };
    const unnamed = await rpc(server(), 'tools/call', params, modernHeaders('tools/call'));

    expect(unnamed.status).toBe(400);
    expect(unnamed.body.error.code).toBe(-32020);

    const sentinel = `=?base64?${btoa('demo.greet')}?=`;
    const named = await rpc(server(), 'tools/call', params, modernHeaders('tools/call', sentinel));

    expect(named.status).toBe(200);
    expect(named.body.result.content[0].text).toBe('"hola ada"');

    const malformed = await rpc(server(), 'tools/call', params, modernHeaders('tools/call', '=?base64?!not-b64!?='));

    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe(-32020);
  });

  it('answers -32602 for an unknown resource', async () => {
    const { body } = await rpc(server(), 'resources/read', { uri: 'janux://page/nope' });

    expect(body.error.code).toBe(-32602);
  });

  it('leaves pre-modern versions on the legacy path, however old', async () => {
    const { status, body } = await rpc(server(), 'tools/list', undefined, {
      'mcp-protocol-version': '2025-03-26',
    });

    expect(status).toBe(200);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });
});
