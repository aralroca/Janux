import { beforeAll, describe, expect, it } from 'bun:test';
import { ssrApp } from './support/app';

/**
 * The home page sells three things — an MCP server from `api()`, WebMCP tools
 * from `component()`, and React interop — and a sales pitch is only as good as
 * the URLs in it. This boots the real docs app and checks that every endpoint
 * and link those sections advertise exists and answers with what was promised.
 */

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];
let home: string;

beforeAll(async () => {
  ({ server, get } = await ssrApp('apps/docs'));
  home = await (await get('/')).text();
});

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
const HERO = /<section class="hero">([\s\S]*?)<\/section>/;
const TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

/** The `.pitch` sections' markup. */
function pitches(): string[] {
  return [...home.matchAll(PITCH_SECTION)].map((match) => match[1]!);
}

/** One `.pitch` section's markup, by the modifier class that names it. */
function pitch(modifier: string): string {
  const match = home.match(new RegExp(`<section class="pitch ${modifier}">([\\s\\S]*?)</section>`));

  return match![1]!;
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

describe('docs home — the hero', () => {
  it('says who wrote it where it can be seen, not in the footer', () => {
    const hero = home.match(HERO)![1]!;

    expect(hero).toContain('From the creator of');
    expect(hero).toContain('https://brisa.build/');
  });

  /** The scaffold is Bun-only; that belongs next to the command, not in a 404 later. */
  it('prints the install command with the runtime it needs', () => {
    const hero = home.match(HERO)![1]!;

    expect(hero).toContain('bun create janux my-app');
    expect(hero).toContain('bunx create-janux my-app');
    expect(hero).toContain('https://bun.sh');
  });
});

describe('docs home — the pitch sections', () => {
  it('sells both agent surfaces and the React story', () => {
    const text = pitchText();

    expect(text).toContain('Ship an MCP server. Get WebMCP for free.');
    expect(text).toContain('A better model. Without giving up the React ecosystem.');
  });

  /** The heading is a promise about which surface leads; the markup has to keep it. */
  it('puts the MCP server and WebMCP side by side, server first', () => {
    const surfaces = pitch('surfaces');
    const server = surfaces.indexOf('MCP server — tools over HTTP');
    const browser = surfaces.indexOf('WebMCP — the same tools, in the browser');

    expect(surfaces).toContain('faces-grid');
    expect(server).toBeGreaterThan(-1);
    expect(server).toBeLessThan(browser);
  });

  /**
   * "It works today with real clients" is the answer to "isn't this a bet on
   * the future?", so the command comes before either snippet, not after both.
   */
  it('opens the surfaces pitch with the command that works today', () => {
    const surfaces = pitch('surfaces');

    expect(surfaces.indexOf('claude mcp add')).toBeLessThan(surfaces.indexOf('faces-grid'));
  });

  /** foreign() answers "I'm not rewriting my stack", which is objection number one. */
  it('puts both pitches above the philosophy and the feature grid', () => {
    expect(home.indexOf('class="pitch split"')).toBeLessThan(home.indexOf('class="mission"'));
    expect(home.indexOf('class="pitch surfaces"')).toBeLessThan(home.indexOf('class="features"'));
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

/**
 * The content-site surface: canonical, social card, structured data and the
 * feed. Google's validator wants every ld+json block parseable with a @context
 * and a @type; readers want the alternate link on the page they landed on.
 */
describe('docs home — SEO surface', () => {
  it('emits a canonical URL and a full social card', () => {
    expect(home).toContain('<link rel="canonical" id="jx-canonical" href="https://janux.build/">');
    expect(home).toContain('property="og:title"');
    expect(home).toContain('property="og:image"');
    expect(home).toContain('name="twitter:card"');
  });

  it('emits JSON-LD blocks that all parse, the Organization among them', () => {
    const blocks = [...home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
      ([, block]) => JSON.parse(block),
    );

    expect(blocks.map((block) => block['@type'])).toContain('Organization');
    blocks.forEach((block) => expect(block['@context']).toBe('https://schema.org'));
  });

  it('advertises the RSS feed and serves every doc page through it', async () => {
    const response = await get('/rss.xml');
    const body = await response.text();

    expect(home).toContain('type="application/rss+xml"');
    expect(response.status).toBe(200);
    expect(body).toContain('<link>https://janux.build/docs/');
  });
});
