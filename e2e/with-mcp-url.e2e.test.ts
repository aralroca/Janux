import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot, ssrApp } from './support/app';

/**
 * examples/with-mcp-url sells one thing: the app IS a bearer-protected MCP
 * server by URL. So the suite exercises the endpoint the way a real client
 * would — landing for browsers, 401 without the token, JSON-RPC with it — and
 * pins the tool contract to a committed golden file: rename a tool, change a
 * guard or touch an input schema and this suite goes red until
 * `agent-contract.json` is updated on purpose.
 */

const EXAMPLE = 'examples/with-mcp-url';
const TOKEN = 'demo-agent-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];

beforeAll(async () => {
  ({ server, get } = await ssrApp(EXAMPLE));
});

function rpc(method: string, params?: unknown, headers: Record<string, string> = {}) {
  return server.fetch(
    new Request('http://test/_janux/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
}

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const body: any = await (await rpc('tools/call', { name, arguments: args }, AUTH)).json();

  return JSON.parse(body.result.content[0].text);
}

describe('examples/with-mcp-url — the landing stays public', () => {
  it('explains itself to a browser without any token', async () => {
    const res = await get('/_janux/mcp', { accept: 'text/html' });
    const page = await res.text();

    expect(res.status).toBe(200);
    expect(page).toContain('claude mcp add --transport http');
    expect(page).toContain('incidents.list');
  });

  it('405s a GET from an MCP client, per streamable HTTP', async () => {
    const res = await get('/_janux/mcp', { accept: 'application/json, text/event-stream' });

    expect(res.status).toBe(405);
  });
});

describe('examples/with-mcp-url — bearer protection on the protocol', () => {
  it('401s a JSON-RPC POST without the token, with the WWW-Authenticate challenge', async () => {
    const res = await rpc('tools/list');

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('401s a wrong token the same way', async () => {
    const res = await rpc('tools/list', undefined, { authorization: 'Bearer not-the-token' });

    expect(res.status).toBe(401);
  });

  it('initializes and lists the three incident tools with the token', async () => {
    const init: any = await (await rpc('initialize', {}, AUTH)).json();
    const list: any = await (await rpc('tools/list', undefined, AUTH)).json();
    const names = list.result.tools.map((tool: any) => tool.name).sort();

    expect(init.result.capabilities).toHaveProperty('tools');
    expect(names).toEqual(['incidents.list', 'incidents.report', 'incidents.resolve']);
  });
});

describe('examples/with-mcp-url — the tool contract cannot drift silently', () => {
  it('matches the committed agent-contract.json (names, guards, input schemas)', async () => {
    const golden = JSON.parse(readFileSync(join(appRoot(EXAMPLE), 'agent-contract.json'), 'utf8'));
    const list: any = await (await rpc('tools/list', undefined, AUTH)).json();
    const manifest: any = await (await get('/_janux/manifest?path=/')).json();
    const guards = new Map<string, string>(
      manifest.tools
        .filter((tool: any) => tool.name.startsWith('api.'))
        .map((tool: any) => [tool.name.slice('api.'.length), tool.guard]),
    );
    const served = list.result.tools
      .map((tool: any) => ({
        name: tool.name,
        guard: guards.get(tool.name) ?? null,
        requiresApproval: tool.annotations?.requiresApproval === true,
        inputSchema: tool.inputSchema,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    expect({ tools: served }).toEqual(golden);
  });
});

describe('examples/with-mcp-url — confirm guard over MCP', () => {
  it('turns incidents.resolve into a proposal instead of executing it', async () => {
    const result = await callTool('incidents.resolve', { id: 1 });

    expect(result.status).toBe('proposal');
    expect(result.tool).toBe('incidents.resolve');
    expect(result.id).toStartWith('prop_api_');
  });

  it('leaves the board untouched until a human approves', async () => {
    const { incidents } = await callTool('incidents.list', {});
    const first = incidents.find((incident: any) => incident.id === 1);

    expect(first.status).toBe('open');
  });

  it('runs auto tools unattended: incidents.report lands on the board', async () => {
    const reported = await callTool('incidents.report', { title: 'MCP e2e probe incident', severity: 'low' });
    const { incidents } = await callTool('incidents.list', {});

    expect(reported.status).toBe('open');
    expect(incidents.map((incident: any) => incident.id)).toContain(reported.id);
  });
});

describe('examples/with-mcp-url — janux verify gates the surface', () => {
  it('exits 0: every reachable tool documents itself', () => {
    const result = Bun.spawnSync(['bunx', 'janux', 'verify'], { cwd: appRoot(EXAMPLE) });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('agent surface OK');
  }, 30_000);
});
