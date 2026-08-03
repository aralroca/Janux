import type { FeedItem } from 'janux';
import { safeAttr } from './html-escape';

/**
 * `rss.xml` from the app's `feed` config — the same idea as `llms.txt` and the
 * `.md` projections, for human readers: the site's content at a well-known URL.
 *
 * Like the sitemap it needs an absolute origin, so it is doubly opt-in:
 * `siteUrl` plus a `feed` whose `items()` names the entries — the router knows
 * pages, not titles or dates, and those live in the app's content layer.
 */

export interface FeedChannel {
  title: string;
  description: string;
}

/** One rule for the channel title and the autodiscovery link: feed's own, else the app's. */
export function feedTitle(feed: { title?: string }, appTitle: string | undefined): string {
  return feed.title ?? appTitle ?? 'Feed';
}

/** ISO date → the RFC-822 form readers expect; an unparseable one is dropped. */
function rfc822(date: string | undefined): string | undefined {
  const parsed = date ? new Date(date) : undefined;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toUTCString() : undefined;
}

function itemXml(siteUrl: string, item: FeedItem): string {
  const url = safeAttr(new URL(item.url, siteUrl).href);
  const pubDate = rfc822(item.date);
  const fields = [
    `<title>${safeAttr(item.title)}</title>`,
    `<link>${url}</link>`,
    `<guid>${url}</guid>`,
    item.description && `<description>${safeAttr(item.description)}</description>`,
    pubDate && `<pubDate>${pubDate}</pubDate>`,
    // Not `<author>`: RSS reserves that for an email address, and a feed that
    // puts a name there fails validation. Dublin Core is where names go.
    item.author && `<dc:creator>${safeAttr(item.author)}</dc:creator>`,
  ].filter(Boolean);

  return `    <item>\n      ${fields.join('\n      ')}\n    </item>`;
}

/** The newest item's date: the channel is exactly as fresh as its content. */
function lastBuildDate(items: FeedItem[]): string | undefined {
  const newest = items
    .map((item) => item.date ?? '')
    .filter(Boolean)
    .sort()
    .at(-1);

  return rfc822(newest);
}

export function buildRssFeed(siteUrl: string, channel: FeedChannel, items: FeedItem[]): string {
  const built = lastBuildDate(items);
  const head = [
    `<title>${safeAttr(channel.title)}</title>`,
    `<link>${safeAttr(new URL(siteUrl).href)}</link>`,
    `<description>${safeAttr(channel.description)}</description>`,
    `<atom:link href="${safeAttr(new URL('/rss.xml', siteUrl).href)}" rel="self" type="application/rss+xml"/>`,
    built && `<lastBuildDate>${built}</lastBuildDate>`,
  ].filter(Boolean);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    ${head.join('\n    ')}`,
    ...items.map((item) => itemXml(siteUrl, item)),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
