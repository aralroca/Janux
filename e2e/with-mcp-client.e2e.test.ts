import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { ssrApp } from './support/app';

/**
 * What examples/with-mcp-client exists to demonstrate: the agent's outbound
 * MCP client. The app connects to a remote MCP server by URL (another Janux
 * app — here apps/docs, served in-process), discovers its tools, filters them
 * with the allowlist (include/exclude, prefix semantics) and re-exposes them
 * on its own surface. A dead remote degrades cleanly instead of crashing.
 */

const APP = 'examples/with-mcp-client';
const ENV_KEYS = ['MCP_SERVER_URL', 'MCP_SERVER_TOKEN', 'MCP_TOOL_INCLUDE', 'MCP_TOOL_EXCLUDE'] as const;

const seenAuth: (string | null)[] = [];
const seenMethods: string[] = [];

let docs: Awaited<ReturnType<typeof ssrApp>>;
let client: Awaited<ReturnType<typeof ssrApp>>;
let remote: ReturnType<typeof Bun.serve>;
let legacyGate: ReturnType<typeof Bun.serve>;
let remoteUrl = '';

const post = (app: Awaited<ReturnType<typeof ssrApp>>, path: string, body: unknown) =>
  app.server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const listRemote = async (app = client) => (await (await post(app, '/_janux/api/remote.listTools', {})).json()) as any;

/** Records the bearer header, then forwards untouched to the in-process docs app. */
const recordingProxy = (req: Request) => {
  seenAuth.push(req.headers.get('authorization'));

  return docs.server.fetch(req);
};

/** Pretends to be a legacy MCP server: 400s modern `_meta` requests, forwards the rest. */
const legacyProxy = async (req: Request) => {
  const body: any = await req.json();

  seenMethods.push(body.method);
  if (body.params?._meta) {
    const error = { code: -32600, message: 'Server not initialized' };

    return Response.json({ jsonrpc: '2.0', id: body.id, error }, { status: 400 });
  }
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

  return docs.server.fetch(new Request('http://docs/_janux/mcp', { method: 'POST', headers, body: JSON.stringify(body) }));
};

beforeAll(async () => {
  docs = await ssrApp('apps/docs');
  remote = Bun.serve({ port: 0, fetch: recordingProxy });
  legacyGate = Bun.serve({ port: 0, fetch: legacyProxy });
  remoteUrl = `http://localhost:${remote.port}/_janux/mcp`;
  process.env.MCP_SERVER_URL = remoteUrl;
  process.env.MCP_SERVER_TOKEN = 'e2e-token';
  process.env.MCP_TOOL_INCLUDE = 'remote.docs.*';
  process.env.MCP_TOOL_EXCLUDE = 'remote.docs.readDoc';
  client = await ssrApp(APP);
});

afterAll(() => {
  remote.stop(true);
  legacyGate.stop(true);
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

describe('examples/with-mcp-client outbound MCP client', () => {
  it('connects, lists the remote tools and applies the allowlist filter', async () => {
    const body = await listRemote();
    const names = body.result.tools.map((tool: any) => tool.name);

    expect(body.ok).toBe(true);
    expect(body.result.available).toBe(true);
    // Discovered and namespaced with the documented 'remote.' prefix.
    expect(names).toContain('remote.docs.listDocs');
    expect(names).toContain('remote.docs.searchDocs');
    names.forEach((name: string) => expect(name.startsWith('remote.docs.')).toBe(true));
    // The excluded tool neither lists nor executes.
    expect(names).not.toContain('remote.docs.readDoc');
    const refused: any = await (await post(client, '/_janux/api/remote.callTool', { name: 'remote.docs.readDoc' })).json();

    expect(refused.ok).toBe(false);
    expect(String(refused.error)).toContain('tool_not_allowed');
  }, 30_000);

  it('invokes a remote tool end to end and returns the real result', async () => {
    const args = JSON.stringify({ query: 'islands' });
    const response = await post(client, '/_janux/api/remote.callTool', { name: 'remote.docs.searchDocs', args });
    const body: any = await response.json();
    const payload = JSON.parse(body.result.content[0].text);

    expect(body.ok).toBe(true);
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matches[0]).toHaveProperty('slug');
    expect(payload.matches[0]).toHaveProperty('title');
  }, 30_000);

  it('re-exposes the remote bridge on its own manifest and hosted MCP', async () => {
    const manifest: any = await (await client.get('/_janux/manifest')).json();
    const manifestNames = manifest.tools.map((tool: any) => tool.name);

    expect(manifestNames).toContain('api.remote.listTools');
    expect(manifestNames).toContain('api.remote.callTool');
    // Both directions at once: the MCP client app is itself an MCP server.
    const rpc: any = await (await post(client, '/_janux/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    const mcpNames = rpc.result.tools.map((tool: any) => tool.name);

    expect(mcpNames).toContain('remote.listTools');
    expect(mcpNames).toContain('remote.callTool');
  }, 30_000);

  it('degrades cleanly when the remote server is down: boots, serves and reports', async () => {
    process.env.MCP_SERVER_URL = 'http://127.0.0.1:1/_janux/mcp';
    try {
      const fresh = await ssrApp(APP);
      const home = await fresh.get('/');

      expect(home.status).toBe(200);
      expect(await home.text()).toContain('Outbound MCP client');
      expect((await fresh.get('/_janux/manifest')).status).toBe(200);
      const body = await listRemote(fresh);

      expect(body.ok).toBe(true);
      expect(body.result.available).toBe(false);
      expect(body.result.tools).toEqual([]);
      expect(String(body.result.error)).not.toBe('');
    } finally {
      process.env.MCP_SERVER_URL = remoteUrl;
    }
  }, 30_000);

  it('sends the bearer token from env and falls back to initialize on a legacy server', async () => {
    // Every request the earlier tests sent carried the env token.
    expect(seenAuth).toContain('Bearer e2e-token');
    process.env.MCP_SERVER_URL = `http://localhost:${legacyGate.port}/_janux/mcp`;
    try {
      const body = await listRemote();

      expect(body.result.available).toBe(true);
      expect(body.result.tools.length).toBeGreaterThan(0);
      // The wire probed modern once, got the legacy 400 and ran the handshake.
      expect(seenMethods).toContain('initialize');
    } finally {
      process.env.MCP_SERVER_URL = remoteUrl;
    }
  }, 30_000);
});
