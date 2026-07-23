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
