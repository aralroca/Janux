import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from '@janux/server';

/**
 * The head half of reference/server-api.md: what a route's `meta` actually puts
 * in the document. The page claims og/twitter tags are *derived* from four
 * fields, that relative URLs resolve against `siteUrl`, and that every node is
 * keyed — claims a reader would otherwise take on faith. These run them through
 * the real server, from route module to emitted HTML.
 */

const routesDir = join(import.meta.dir, '__fixtures__/head-routes');

async function headOf(path: string, siteUrl?: string): Promise<string> {
  const server = createJanuxServer({ routesDir, siteUrl, title: 'Janux' });
  const html = await (await server.fetch(new Request(`http://test${path}`))).text();

  return /<head>([\s\S]*?)<\/head>/.exec(html)![1]!;
}

describe('reference/server-api.md', () => {
  it('derives the social card from title, description, image and canonical', async () => {
    const head = await headOf('/', 'https://janux.dev');

    expect(head).toContain('<meta property="og:title" id="jx-og-title" content="What is Janux? — Janux docs">');
    expect(head).toContain('<meta property="og:type" id="jx-og-type" content="website">');
    expect(head).toContain(
      '<meta property="og:description" id="jx-og-description" content="The agent-native fullstack UI framework.">',
    );
    expect(head).toContain('<meta name="twitter:card" id="jx-twitter-card" content="summary_large_image">');
  });

  it('resolves a relative image and canonical against siteUrl', async () => {
    const head = await headOf('/', 'https://janux.dev');

    expect(head).toContain('<link rel="canonical" id="jx-canonical" href="https://janux.dev/docs/getting-started/what-is-janux">');
    expect(head).toContain('content="https://janux.dev/og/what-is-janux.png"');
    expect(head).toContain('<meta property="og:url" id="jx-og-url" content="https://janux.dev/docs/getting-started/what-is-janux">');
  });

  it('drops relative social URLs instead of emitting broken ones when siteUrl is absent', async () => {
    const head = await headOf('/');

    expect(head).not.toContain('canonical');
    expect(head).not.toContain('og:image');
    // the rest of the head still renders
    expect(head).toContain('og:title');
  });

  it('emits robots, the description meta and the title from the same meta object', async () => {
    const head = await headOf('/', 'https://janux.dev');

    expect(head).toContain('<meta name="robots" id="jx-robots" content="index,follow">');
    expect(head).toContain('<title>What is Janux? — Janux docs</title>');
    expect(head).toContain('name="description" id="jx-description"');
  });

  it('lets og/twitter maps override the derived values with unprefixed keys', async () => {
    const head = await headOf('/article', 'https://janux.dev');

    expect(head).toContain('<meta property="og:type" id="jx-og-type" content="article">');
    expect(head).toContain('<meta name="twitter:site" id="jx-twitter-site" content="@janux">');
    // no image on this route, so the card degrades
    expect(head).toContain('content="summary"');
  });

  it('emits one keyed ld+json script per entry and renders the head escape hatch', async () => {
    const head = await headOf('/article', 'https://janux.dev');

    expect(head).toContain('<script type="application/ld+json" id="jx-jsonld-0">{"@type":"BreadcrumbList"}</script>');
    expect(head).toContain('<script type="application/ld+json" id="jx-jsonld-1">{"@type":"TechArticle"}</script>');
    expect(head).toContain('<link rel="preload" as="image" href="/demo-poster.jpg" id="jx-head-0">');
  });

  it('keys every node it writes, so the SPA diff matches by identity', async () => {
    const head = await headOf('/', 'https://janux.dev');
    const unkeyed = [...head.matchAll(/<(meta|link|script)\b(?![^>]*\bid=)[^>]*>/g)].map((match) => match[0]);

    // charset and viewport are the two fixed nodes every page shares.
    expect(unkeyed).toEqual(['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">']);
  });
});
