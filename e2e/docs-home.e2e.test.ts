import { beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { prodServerOptions } from '../packages/janux-cli/src/prod';

/**
 * The home page sells three things — WebMCP tools from `component()`, an MCP
 * server from `api()`, and React interop — and a sales pitch is only as good as
 * the URLs in it. This boots the real docs app and checks that every endpoint
 * and link those sections advertise exists and answers with what was promised.
 */

const APP_ROOT = join(import.meta.dir, '../apps/docs');

let server: ReturnType<typeof createJanuxServer>;
let home: string;

beforeAll(async () => {
  server = createJanuxServer(await prodServerOptions(APP_ROOT));
  home = await (await get('/')).text();
});

const get = (path: string) => server.fetch(new Request(`http://test${path}`));

function rpc(method: string, params?: unknown) {
  return server.fetch(
    new Request('http://test/_janux/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
}

const PITCH_SECTION = /<section class="pitch[^"]*">([\s\S]*?)<\/section>/g;
const TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

/** The `.pitch` sections' markup. */
function pitches(): string[] {
  return [...home.matchAll(PITCH_SECTION)].map((match) => match[1]!);
}

/**
 * Their rendered text — shiki splits every snippet across spans, so the code
 * only reads back as text. Headings hold `&nbsp;` to keep product names on one
 * line, which is a different character than the one anyone asserts against.
 */
function pitchText(): string {
  return pitches()
    .join('\n')
    .replace(TAG, '')
    .replace(/&lt;|&gt;|&amp;|&quot;|&#39;/g, (entity) => ENTITY[entity]!)
    .replace(/&nbsp;| /g, ' ');
}

/** Every href the three `.pitch` sections point at. */
function pitchLinks(): string[] {
  const hrefs = pitches().flatMap((section) => [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!));

  return [...new Set(hrefs)];
}

describe('docs home — the pitch sections', () => {
  it('sells both agent surfaces and the React story', () => {
    const text = pitchText();

    expect(text).toContain('Ship WebMCP tools and an MCP server. Same code.');
    expect(text).toContain('Better than React. Still runs the React ecosystem.');
  });

  it('puts WebMCP and the MCP server side by side, each with its own label', () => {
    const [surfaces] = pitches();

    expect(surfaces).toContain('faces-grid');
    expect(surfaces).toContain('WebMCP — tools in the browser');
    expect(surfaces).toContain('MCP server — tools over HTTP');
  });

  it('shows a real snippet for each surface', () => {
    const text = pitchText();

    expect(text).toContain("component({");
    expect(text).toContain('add: intent({');
    expect(text).toContain('export const refund = api({');
    expect(text).toContain("guard: 'confirm'");
    expect(text).toContain('foreign(ReactFlow, {');
  });

  it('prints the command that registers the MCP server', () => {
    expect(pitchText()).toContain('claude mcp add --transport http my-app https://your.app/_janux/mcp');
  });

  it('links only to pages that exist', async () => {
    const internal = pitchLinks().filter((href) => href.startsWith('/'));
    const statuses = await Promise.all(internal.map(async (href) => [href, (await get(href)).status] as const));

    expect(internal.length).toBeGreaterThan(0);
    expect(statuses.filter(([, status]) => status !== 200)).toEqual([]);
  });
});

/**
 * `/_janux/mcp` is the one URL the page tells you to paste into an MCP client,
 * so "it exists" is not enough — it has to speak MCP and list real tools.
 */
describe('docs home — the advertised MCP endpoint', () => {
  it('is the URL the page prints', () => {
    expect(home).toContain('/_janux/mcp');
  });

  it('initializes over streamable HTTP', async () => {
    const res = await rpc('initialize', {});
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.capabilities).toHaveProperty('tools');
    expect(body.result.capabilities).toHaveProperty('resources');
  });

  it('lists the app\'s api() tools with their schemas', async () => {
    const body: any = await (await rpc('tools/list')).json();
    const tools: any[] = body.result.tools;

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => tool.name.includes('.') && tool.description && tool.inputSchema)).toBe(true);
  });

  it('serves pages as readable resources', async () => {
    const body: any = await (await rpc('resources/list')).json();

    expect(body.result.resources.map((resource: any) => resource.uri)).toContain('janux://page/');
  });

  it('405s a GET that is not a browser, per streamable HTTP', async () => {
    const res = await server.fetch(
      new Request('http://test/_janux/mcp', { headers: { accept: 'application/json, text/event-stream' } }),
    );

    expect(res.status).toBe(405);
  });

  /** The CLI banner prints this URL. Clicking it has to explain itself, not error. */
  it('explains itself to a browser, listing the docs tools it really serves', async () => {
    const res = await server.fetch(new Request('http://test/_janux/mcp', { headers: { accept: 'text/html' } }));
    const page = await res.text();
    const { result }: any = await (await rpc('tools/list')).json();

    expect(res.status).toBe(200);
    expect(page).toContain('claude mcp add --transport http');
    result.tools.forEach((tool: any) => expect(page).toContain(tool.name));
  });
});
