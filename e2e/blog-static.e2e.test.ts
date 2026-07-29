import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot, isBuilt, ssrApp } from './support/app';

const DIST = join(appRoot('examples/blog-static'), 'dist/client');
const SLUGS = ['agent-readable-pages', 'zero-js-by-default', 'hello-janux'];
const PAGES = ['/', ...SLUGS.map((slug) => `/posts/${slug}`)];

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];

beforeAll(async () => {
  ({ server, get } = await ssrApp('examples/blog-static'));
});

const distPage = (page: string) => readFileSync(join(DIST, page.slice(1), 'index.html'), 'utf8');

describe('examples/blog-static end to end', () => {
  it('lists every post on the index, newest first', async () => {
    const html = await (await get('/')).text();
    const positions = SLUGS.map((slug) => html.indexOf(`href="/posts/${slug}"`));

    expect(html).toContain('Latest posts');
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((first, second) => first - second)).toEqual(positions);
  });

  it('renders a post markdown body as HTML', async () => {
    const html = await (await get('/posts/hello-janux')).text();

    expect(html).toContain('<title>Hello, Janux — Janux Static Blog</title>');
    expect(html).toContain('<h2>Files as the source of truth</h2>');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('<li><strong>Bold</strong>, <code>inline code</code> and');
  });

  it('answers a slug with no post with the 404 page, not a 200 that says so', async () => {
    const response = await get('/posts/never-written');
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('<title>Not found — Janux Static Blog</title>');
    // Still the blog: _404 renders inside the layout.
    expect(html).toContain('Janux Static Blog</a>');
  });

  it('emits the configured speculation rules on every page', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('<script type="speculationrules"');
    expect(html).toContain('"eagerness":"moderate"');
    expect(html).toContain('"not":{"href_matches":"/llms.txt"}');
    expect(html).toContain('"not":{"href_matches":"/sitemap.xml"}');
  });

  it('enumerates every post through listPages (drives the static prerender)', async () => {
    expect((await server.listPages()).sort()).toEqual([...PAGES].sort());
  });

  it('serves llms.txt with the concrete post pages', async () => {
    const response = await get('/llms.txt');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('# Janux Static Blog');
    SLUGS.forEach((slug) => expect(body).toContain(`- [/posts/${slug}](/posts/${slug})`));
  });

  it('serves any post as markdown through the .md projection', async () => {
    const response = await get('/posts/agent-readable-pages.md');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(body).toContain('## Three machine-readable views');
    expect(body).toContain('[/llms.txt](/llms.txt)');
  });

  it('serves a sitemap with absolute post urls', async () => {
    const response = await get('/sitemap.xml');
    const body = await response.text();

    expect(response.status).toBe(200);
    SLUGS.forEach((slug) => expect(body).toContain(`https://blog-static.janux.build/posts/${slug}`));
  });
});

describe.skipIf(!isBuilt('examples/blog-static'))('examples/blog-static static build', () => {
  it('prerenders one html file per page with its content', () => {
    expect(distPage('/')).toContain('Latest posts');
    SLUGS.forEach((slug) => expect(distPage(`/posts/${slug}`)).toContain('<h1>'));
    expect(distPage('/posts/hello-janux')).toContain('<h2>Files as the source of truth</h2>');
  });

  it('ships zero JavaScript: no client.js, no script src, no module scripts', () => {
    PAGES.map(distPage).forEach((html) => {
      expect(html).not.toContain('client.js');
      expect(html).not.toContain('<script src=');
      expect(html).not.toContain('type="module"');
    });
  });

  /** A static host has no server to ask: an unknown path is served from 404.html. */
  it('emits 404.html from _404.tsx', () => {
    const html = readFileSync(join(DIST, '404.html'), 'utf8');

    expect(html).toContain('<title>Not found — Janux Static Blog</title>');
    expect(html).toContain('There is no page at this address.');
  });

  it('emits llms.txt and sitemap.xml beside the pages', () => {
    const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');

    expect(llms).toContain('/posts/hello-janux');
    expect(existsSync(join(DIST, 'sitemap.xml'))).toBe(true);
    expect(existsSync(join(DIST, 'robots.txt'))).toBe(true);
  });

  it('emits the .md projection of every page, at the URL a running server answers', () => {
    const post = readFileSync(join(DIST, 'posts/agent-readable-pages.md'), 'utf8');

    expect(post).toContain('## Three machine-readable views');
    expect(readFileSync(join(DIST, '.md'), 'utf8')).toContain('Latest posts');
    SLUGS.forEach((slug) => expect(existsSync(join(DIST, `posts/${slug}.md`))).toBe(true));
  });
});
