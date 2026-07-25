import { describe, expect, it } from 'bun:test';
import { jsx } from 'janux';
import { createJanuxServer } from './server';
import { buildRobotsTxt, buildSitemap } from './sitemap';

describe('buildSitemap', () => {
  it('lists every page as an absolute URL', () => {
    const xml = buildSitemap('https://janux.dev', ['/', '/docs/guide/forms']);

    expect(xml).toContain('<loc>https://janux.dev/</loc>');
    expect(xml).toContain('<loc>https://janux.dev/docs/guide/forms</loc>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  /** A pattern reaching the sitemap would advertise a URL that 404s. */
  it('drops dynamic patterns that never resolved to real pages', () => {
    const xml = buildSitemap('https://janux.dev', ['/orders/[id]', '/orders/1']);

    expect(xml).not.toContain('[id]');
    expect(xml).toContain('/orders/1');
  });

  it('escapes what XML cannot carry raw', () => {
    expect(buildSitemap('https://janux.dev', ['/search?q=a&b=c'])).toContain('&amp;b=c');
  });

  it('resolves against a siteUrl with a trailing slash, without doubling it', () => {
    expect(buildSitemap('https://janux.dev/', ['/a'])).toContain('<loc>https://janux.dev/a</loc>');
  });

  it('stays valid with no pages at all', () => {
    expect(buildSitemap('https://janux.dev', [])).toContain('</urlset>');
  });
});

describe('buildRobotsTxt', () => {
  it('points crawlers at the sitemap', () => {
    expect(buildRobotsTxt('https://janux.dev')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://janux.dev/sitemap.xml\n',
    );
  });
});

describe('GET /sitemap.xml and /robots.txt', () => {
  it('serves both from the pages the router knows, expanding dynamic routes', async () => {
    const server = createJanuxServer({
      routesDir: `${import.meta.dirname}/__fixtures__/routes`,
      siteUrl: 'https://janux.dev',
    });
    const sitemap = await server.fetch(new Request('http://test/sitemap.xml'));
    const xml = await sitemap.text();

    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<loc>https://janux.dev/orders/1</loc>');
    expect(xml).toContain('<loc>https://janux.dev/orders/2</loc>');
    // the pattern staticParams could not expand is not a real URL
    expect(xml).not.toContain('tags');

    const robots = await server.fetch(new Request('http://test/robots.txt'));

    expect(robots.headers.get('content-type')).toContain('text/plain');
    expect(await robots.text()).toContain('Sitemap: https://janux.dev/sitemap.xml');
  });

  it('404s both without a siteUrl, since neither is valid relative', async () => {
    const server = createJanuxServer({ routes: { '/': () => jsx('main', {}) } });

    expect((await server.fetch(new Request('http://test/sitemap.xml'))).status).toBe(404);
    expect((await server.fetch(new Request('http://test/robots.txt'))).status).toBe(404);
  });
});
