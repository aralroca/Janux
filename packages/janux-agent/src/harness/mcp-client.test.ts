import { describe, expect, it } from 'bun:test';
import { schema, str } from 'janux';
import { api, createJanuxServer } from '@janux/server';
import { connectMcp, createMcpPool } from './mcp-client';

const target = createJanuxServer({
  title: 'remote-app',
  apis: {
    remote: {
      hello: api({
        description: 'Say hello',
        input: schema({ name: str() }),
        run: ({ input }) => `hola ${input.name}`,
      }),
    },
  },
});

/** Route the client's fetch straight into the server under test. */
const loopback = (url: string, init?: RequestInit) => target.fetch(new Request(url, init));

describe('outbound MCP client', () => {
  it('lists and calls tools on a remote Janux hosted MCP (round-trip)', async () => {
    const connection = connectMcp({ url: 'http://remote/_janux/mcp', fetchImpl: loopback, namespace: 'didit' });
    const tools = await connection.tools();

    expect(tools.map((tool) => tool.name)).toContain('didit.remote.hello');
    const result: any = await connection.call('didit.remote.hello', { name: 'ada' });

    expect(result.content[0].text).toBe('"hola ada"');
  });

  it('pool caches per key and evicts on dead connections', async () => {
    const pool = createMcpPool();
    const good = pool.get('u1', { url: 'http://remote/_janux/mcp', fetchImpl: loopback });

    expect(pool.get('u1', { url: 'ignored', fetchImpl: loopback })).toBe(good);

    const dead = pool.get('u2', {
      url: 'http://remote/_janux/mcp',
      fetchImpl: async () => new Response(null, { status: 502 }),
    });

    await expect(dead.tools()).rejects.toThrow('mcp_http_502');
    expect(pool.size()).toBe(1);
  });
});

const META = 'io.modelcontextprotocol/';

/** Records every request; era 'modern' answers everything, 'legacy' 400s modern requests. */
function mockServer(era: 'modern' | 'legacy', tools: any[]) {
  const calls: Array<{ method: string; params: any; headers: Record<string, string> }> = [];
  const answer = (body: any) => {
    const result = body.method === 'tools/list' ? { tools } : body.method === 'tools/call' ? { content: [] } : {};

    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  };
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);

    calls.push({ method: body.method, params: body.params, headers: (init?.headers ?? {}) as Record<string, string> });
    if (era === 'legacy' && body.params?._meta) {
      return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32600, message: 'Server not initialized' } }, { status: 400 });
    }

    return answer(body);
  };

  return { calls, fetchImpl };
}

describe('outbound MCP client — 2026-07-28 dual-era', () => {
  it('speaks modern per-request metadata, no handshake, against a modern server', async () => {
    const { calls, fetchImpl } = mockServer('modern', [{ name: 'search', description: '', inputSchema: { type: 'object' } }]);
    const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl });

    await connection.tools();
    await connection.call('search', { q: 'janux' });

    expect(calls.map((call) => call.method)).toEqual(['tools/list', 'tools/call']);
    expect(calls[0]!.headers['mcp-protocol-version']).toBe('2026-07-28');
    expect(calls[0]!.headers['mcp-method']).toBe('tools/list');
    expect(calls[0]!.params._meta[`${META}protocolVersion`]).toBe('2026-07-28');
    expect(calls[1]!.headers['mcp-name']).toBe('search');
  });

  it('mirrors x-mcp-header params into Mcp-Param headers, sentinel-encoding unsafe values', async () => {
    const inputSchema = {
      type: 'object',
      properties: { region: { type: 'string', 'x-mcp-header': 'Region' }, q: { type: 'string' } },
    };
    const { calls, fetchImpl } = mockServer('modern', [{ name: 'search', description: '', inputSchema }]);
    const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl });

    await connection.tools();
    await connection.call('search', { region: 'us-west1', q: 'janux' });
    await connection.call('search', { region: 'ürtümbia' });

    expect(calls[1]!.headers['mcp-param-region']).toBe('us-west1');
    expect(calls[1]!.headers).not.toHaveProperty('mcp-param-q');
    expect(calls[2]!.headers['mcp-param-region']).toBe(`=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode('ürtümbia')))}?=`);
  });

  it('falls back to the legacy handshake on a 400 without a modern error, and caches the era', async () => {
    const { calls, fetchImpl } = mockServer('legacy', [{ name: 'search', description: '', inputSchema: { type: 'object' } }]);
    const connection = connectMcp({ url: 'https://remote/mcp', fetchImpl });
    const tools = await connection.tools();

    expect(tools.map((tool) => tool.name)).toContain('search');
    await connection.call('search', {});

    const methods = calls.map((call) => call.method);

    expect(methods.filter((method) => method === 'initialize')).toHaveLength(1);
    // One modern probe, then everything stays legacy — no per-request re-probing.
    expect(calls.filter((call) => call.params?._meta)).toHaveLength(1);
  });
});
