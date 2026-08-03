import { describe, expect, it } from 'bun:test';
import { buildRssFeed } from './feed';
import { createJanuxServer } from './server';

const SITE = 'https://site.test';
const channel = { title: 'Blog', description: 'Posts' };

describe('buildRssFeed', () => {
  it('lists every item with an absolute link and a matching guid', () => {
    const xml = buildRssFeed(SITE, channel, [{ url: '/posts/a', title: 'A' }]);

    expect(xml).toContain('<link>https://site.test/posts/a</link>');
    expect(xml).toContain('<guid>https://site.test/posts/a</guid>');
    expect(xml).toContain('<title>A</title>');
  });

  it('formats ISO dates as the RFC-822 pubDate readers expect', () => {
    const xml = buildRssFeed(SITE, channel, [{ url: '/a', title: 'A', date: '2026-07-20' }]);

    expect(xml).toContain('<pubDate>Mon, 20 Jul 2026 00:00:00 GMT</pubDate>');
  });

  it('omits description, pubDate and author when the item has none', () => {
    const xml = buildRssFeed(SITE, channel, [{ url: '/a', title: 'A' }]);

    expect(xml).not.toContain('<pubDate>');
    expect(xml).not.toContain('creator');
    expect(xml.split('<description>')).toHaveLength(2); // the channel's only
  });

  /**
   * RSS reserves `<author>` for an email address — a feed carrying a name there
   * is invalid, and a name is what an app actually has. Dublin Core is where
   * every real feed puts it.
   */
  it('carries an author name as dc:creator, declaring the namespace', () => {
    const xml = buildRssFeed(SITE, channel, [{ url: '/a', title: 'A', author: 'Aral Roca' }]);

    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).toContain('<dc:creator>Aral Roca</dc:creator>');
    expect(xml).not.toContain('<author>');
  });

  it('drops an unparseable date rather than emitting Invalid Date', () => {
    expect(buildRssFeed(SITE, channel, [{ url: '/a', title: 'A', date: 'someday' }])).not.toContain('Invalid');
  });

  it('escapes what XML cannot carry raw', () => {
    const xml = buildRssFeed(SITE, channel, [{ url: '/a', title: 'A & B <tag>', description: '"quoted"' }]);

    expect(xml).toContain('A &amp; B &lt;tag>');
    expect(xml).not.toContain('<tag>');
  });

  it('advertises its own URL through an atom self link', () => {
    expect(buildRssFeed(SITE, channel, [])).toContain(
      '<atom:link href="https://site.test/rss.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  it('takes lastBuildDate from the newest item', () => {
    const xml = buildRssFeed(SITE, channel, [
      { url: '/old', title: 'Old', date: '2026-07-01' },
      { url: '/new', title: 'New', date: '2026-07-20' },
    ]);

    expect(xml).toContain('<lastBuildDate>Mon, 20 Jul 2026 00:00:00 GMT</lastBuildDate>');
  });

  it('stays valid with no items at all', () => {
    const xml = buildRssFeed(SITE, channel, []);

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Blog</title>');
    expect(xml).not.toContain('<lastBuildDate>');
  });
});

describe('GET /rss.xml', () => {
  const feed = { items: () => [{ url: '/posts/a', title: 'A', date: '2026-07-20' }] };

  it('serves the feed when siteUrl and feed are configured', async () => {
    const server = createJanuxServer({ routes: {}, siteUrl: SITE, feed: { ...feed, title: 'Blog', description: 'Posts' } });
    const response = await server.fetch(new Request('http://localhost/rss.xml'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(await response.text()).toContain('<link>https://site.test/posts/a</link>');
  });

  it('falls back to the app title for an untitled channel', async () => {
    const server = createJanuxServer({ routes: {}, title: 'My App', siteUrl: SITE, feed });
    const body = await (await server.fetch(new Request('http://localhost/rss.xml'))).text();

    expect(body).toContain('<title>My App</title>');
  });

  it('404s without a siteUrl, since a feed of relative links is invalid', async () => {
    const server = createJanuxServer({ routes: {}, feed });

    expect((await server.fetch(new Request('http://localhost/rss.xml'))).status).toBe(404);
  });

  it('404s without a feed config — the app did not ask for one', async () => {
    const server = createJanuxServer({ routes: {}, siteUrl: SITE });

    expect((await server.fetch(new Request('http://localhost/rss.xml'))).status).toBe(404);
  });
});
