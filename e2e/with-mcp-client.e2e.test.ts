import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Browser } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/with-mcp-client exists to demonstrate: the agent's outbound
 * MCP client. With no configuration at all it targets the demo MCP server the
 * example starts in its own process — so the example works the moment it
 * boots; `MCP_SERVER_URL` retargets it at a real server, the allowlist filters
 * what crosses (include/exclude, prefix semantics), and a dead remote degrades
 * into an actionable panel instead of a crash.
 */

const APP = 'examples/with-mcp-client';
const BUILT = isBuilt(APP);
const ENV_KEYS = ['MCP_SERVER_URL', 'MCP_SERVER_TOKEN', 'MCP_TOOL_INCLUDE', 'MCP_TOOL_EXCLUDE'] as const;
const DEAD = 'http://127.0.0.1:1/mcp';

const seenAuth: (string | null)[] = [];
const seenMethods: string[] = [];

let client: Awaited<ReturnType<typeof ssrApp>>;
let remote: ReturnType<typeof Bun.serve>;
let legacyGate: ReturnType<typeof Bun.serve>;
let remoteUrl = '';
let demoUrl = '';

const post = (app: Awaited<ReturnType<typeof ssrApp>>, path: string, body: unknown) =>
  app.server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      // Stands in for the app's own page, which is what the CSRF guard on
      // `/_janux/*` asks about. The OUTBOUND leg to the remote MCP server is a
      // separate matter and needs nothing: `/_janux/mcp` is not guarded.
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify(body),
    }),
  );

const listRemote = async (app = client) => (await (await post(app, '/_janux/api/remote.listTools', {})).json()) as any;
const toDemo = (body: string) =>
  fetch(demoUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

/** Records the bearer header, then forwards untouched to the example's demo server. */
const recordingProxy = async (req: Request) => {
  seenAuth.push(req.headers.get('authorization'));

  return toDemo(await req.text());
};

/** Pretends to be a legacy MCP server: 400s modern `_meta` requests, forwards the rest. */
const legacyProxy = async (req: Request) => {
  const body: any = await req.json();

  seenMethods.push(body.method);
  if (body.params?._meta) {
    const error = { code: -32600, message: 'Server not initialized' };

    return Response.json({ jsonrpc: '2.0', id: body.id, error }, { status: 400 });
  }

  return toDemo(JSON.stringify(body));
};

beforeAll(async () => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
  remote = Bun.serve({ port: 0, fetch: recordingProxy });
  legacyGate = Bun.serve({ port: 0, fetch: legacyProxy });
  remoteUrl = `http://localhost:${remote.port}/mcp`;
  // `defineAgent({ mcp })` reads its url once, at mount: pointing the mount at
  // the recording proxy is what lets the lazy-discovery test observe silence.
  // Every api() call re-reads env, so the suite still runs on the default.
  process.env.MCP_SERVER_URL = remoteUrl;
  client = await ssrApp(APP);
  delete process.env.MCP_SERVER_URL;
  demoUrl = (await listRemote()).result.url;
});

afterAll(() => {
  remote.stop(true);
  legacyGate.stop(true);
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

describe('examples/with-mcp-client with no configuration at all', () => {
  it('targets the demo MCP server it starts itself and lists its tools', async () => {
    const body = await listRemote();
    const names = body.result.tools.map((tool: any) => tool.name);

    expect(body.result.available).toBe(true);
    expect(body.result.demo).toBe(true);
    expect(body.result.url).toContain('http://localhost:');
    expect(body.result.error).toBeUndefined();
    expect(body.result.hint).toBeUndefined();
    // Discovered over the wire and namespaced with the documented prefix.
    expect(names).toEqual(['remote.notes.list', 'remote.notes.read', 'remote.notes.search']);
  }, 30_000);

  it('invokes a remote tool end to end and returns the real result', async () => {
    const response = await post(client, '/_janux/api/remote.callTool', { name: 'remote.notes.search' });
    const body: any = await response.json();
    const payload = JSON.parse(body.result.content[0].text);

    expect(body.ok).toBe(true);
    expect(payload.query).toBe('tools');
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matches[0]).toHaveProperty('id');
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
});

describe('examples/with-mcp-client pointed at another server', () => {
  it('applies the allowlist filter to the prefixed names', async () => {
    process.env.MCP_TOOL_INCLUDE = 'remote.notes.*';
    process.env.MCP_TOOL_EXCLUDE = 'remote.notes.read';
    try {
      const names = (await listRemote()).result.tools.map((tool: any) => tool.name);

      expect(names).toContain('remote.notes.search');
      expect(names).not.toContain('remote.notes.read');
      const refused: any = await (await post(client, '/_janux/api/remote.callTool', { name: 'remote.notes.read' })).json();

      expect(refused.ok).toBe(false);
      expect(String(refused.error)).toContain('tool_not_allowed');
    } finally {
      delete process.env.MCP_TOOL_INCLUDE;
      delete process.env.MCP_TOOL_EXCLUDE;
    }
  }, 30_000);

  it('sends the bearer token from env and falls back to initialize on a legacy server', async () => {
    process.env.MCP_SERVER_URL = remoteUrl;
    process.env.MCP_SERVER_TOKEN = 'e2e-token';
    try {
      expect((await listRemote()).result.demo).toBe(false);
      expect(seenAuth).toContain('Bearer e2e-token');
      process.env.MCP_SERVER_URL = `http://localhost:${legacyGate.port}/mcp`;
      const body = await listRemote();

      expect(body.result.available).toBe(true);
      expect(body.result.tools.length).toBeGreaterThan(0);
      // The wire probed modern once, got the legacy 400 and ran the handshake.
      expect(seenMethods).toContain('initialize');
    } finally {
      delete process.env.MCP_SERVER_URL;
      delete process.env.MCP_SERVER_TOKEN;
    }
  }, 30_000);

  it('degrades cleanly when that server is down: boots, serves and says what to do', async () => {
    process.env.MCP_SERVER_URL = DEAD;
    try {
      const home = await client.get('/');

      expect(home.status).toBe(200);
      expect(await home.text()).toContain('Outbound MCP client');
      expect((await client.get('/_janux/manifest')).status).toBe(200);
      const { result } = await listRemote();

      expect(result.available).toBe(false);
      expect(result.tools).toEqual([]);
      // Actionable, not a stack trace: what happened, and what to type next.
      expect(result.hint).toContain('MCP_SERVER_URL');
      expect(result.hint).toContain('built-in demo server');
      expect(result.fix).toContain('examples/with-mcp-url');
      expect(String(result.error)).not.toBe('');
    } finally {
      delete process.env.MCP_SERVER_URL;
    }
  }, 30_000);

  it('mounts defineAgent({ mcp }) and leaves the remote untouched until a modeled turn (lazy discovery)', async () => {
    // Force the no-model path: the repo .env may carry a provider key.
    const MODEL_KEYS = ['JANUX_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY'];
    const saved = MODEL_KEYS.map((key) => [key, process.env[key]] as const);

    MODEL_KEYS.forEach((key) => delete process.env[key]);
    try {
      const contacts = seenAuth.length;
      const reply: any = await (await post(client, '/_janux/agent', { messages: [{ role: 'user', content: 'hi' }] })).json();

      // Without a model the mount answers with the setup card…
      expect(reply.type).toBe('setup');
      // …and the lazy MCP discovery never fired a request at the mounted remote.
      expect(seenAuth.length).toBe(contacts);
    } finally {
      saved.forEach(([key, value]) => {
        if (value !== undefined) process.env[key] = value;
      });
    }
  }, 30_000);
});

describe.if(BUILT)('examples/with-mcp-client in a real browser', () => {
  let browser: Browser | undefined;
  let base = '';
  let stop: (() => void) | undefined;

  beforeAll(async () => {
    ({ base, stop } = await serveBuilt(APP));
    browser = await launchBrowser();
  });

  afterAll(() => stop?.());

  it('with no configuration: real tools on screen, and one click round-trips', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${base}/`);
    await page.waitForSelector('.pill.ok');
    expect(await page.locator('.tool code').allTextContents()).toContain('remote.notes.search');
    expect(await page.locator('.badge').textContent()).toContain('built-in demo server');
    expect(await page.locator('.hint').count()).toBe(0);
    await page.locator('.tool', { hasText: 'remote.notes.search' }).locator('.invoke').click();
    await page.waitForSelector('.result');
    expect(await page.locator('.result').textContent()).toContain('matches');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('with a dead MCP_SERVER_URL: an actionable panel, not a raw error', async () => {
    process.env.MCP_SERVER_URL = DEAD;
    const { page, errors } = await newPage(browser!);

    try {
      await page.goto(`${base}/`);
      await page.waitForSelector('.pill.down');
      const hint = await page.locator('.hint').textContent();

      expect(hint).toContain('MCP_SERVER_URL');
      expect(await page.locator('.fix').textContent()).toContain('examples/with-mcp-url');
      // The technical detail stays available, but folded away.
      expect(await page.locator('.raw code').isVisible()).toBe(false);
      expect(await page.locator('.tool').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      delete process.env.MCP_SERVER_URL;
      await page.close();
    }
  }, TIMEOUT);
});
