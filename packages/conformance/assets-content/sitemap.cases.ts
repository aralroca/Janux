import type { Case } from '../support/case';

/**
 * `sitemap.xml`, from the pages the router already knows.
 *
 * Two filters decide what a crawler sees. A page that still carries a `[param]`
 * never resolved to a real URL — `staticParams` did not expand it — and listing
 * the pattern would send crawlers to a literal `/blog/[slug]`. And every URL is
 * resolved through `new URL`, so what lands in `<loc>` is percent-encoded, then
 * XML-escaped: a `&` in a query string is the difference between a valid
 * sitemap and one Search Console rejects wholesale.
 *
 * There is no dedupe and no sort. The router's order is the sitemap's order,
 * which keeps a build byte-reproducible.
 */
export interface SitemapCase {
  siteUrl: string;
  pages: string[];
  /** The `<loc>` values, in order — the envelope is asserted once by the runner. */
  expected: string[];
}

export type SitemapRow = Case<SitemapCase>;

const SITE = 'https://site.test';

export const SITEMAP_CASES: SitemapRow[] = [
  { id: 'head-sitemap-root-page', src: 'janux', siteUrl: SITE, pages: ['/'], expected: ['https://site.test/'] },
  {
    id: 'head-sitemap-keeps-the-routers-order',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/z', '/a', '/m'],
    expected: ['https://site.test/z', 'https://site.test/a', 'https://site.test/m'],
  },
  {
    /** No dedupe: two routes answering one URL is a router problem, and hiding it helps nobody. */
    id: 'head-sitemap-repeats-a-repeated-page',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/a', '/a'],
    expected: ['https://site.test/a', 'https://site.test/a'],
  },
  { id: 'head-sitemap-drops-a-dynamic-segment', src: 'janux', siteUrl: SITE, pages: ['/about', '/blog/[slug]'], expected: ['https://site.test/about'] },
  { id: 'head-sitemap-drops-a-catch-all', src: 'janux', siteUrl: SITE, pages: ['/docs/[...path]'], expected: [] },
  { id: 'head-sitemap-drops-an-optional-catch-all', src: 'janux', siteUrl: SITE, pages: ['/[[...opt]]'], expected: [] },
  {
    /** The check is for `[` anywhere, so a bracket mid-segment is dropped too. */
    id: 'head-sitemap-drops-a-bracket-anywhere-in-the-path',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/docs/a[1]'],
    expected: [],
  },
  {
    /** A closing bracket alone never marked a parameter, so it is a real path. */
    id: 'head-sitemap-keeps-a-lone-closing-bracket',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/docs/a]b'],
    expected: ['https://site.test/docs/a]b'],
  },
  {
    /** Route groups are a filesystem convention, not a parameter — they reach the URL as written. */
    id: 'head-sitemap-keeps-a-route-group-in-the-url',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/(marketing)/about'],
    expected: ['https://site.test/(marketing)/about'],
  },
  {
    /** `&` is the one character that makes a whole sitemap unparseable. */
    id: 'head-sitemap-escapes-an-ampersand',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/q?x=1&y=2'],
    expected: ['https://site.test/q?x=1&amp;y=2'],
  },
  {
    id: 'head-sitemap-escapes-an-ampersand-in-a-path',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/a&b'],
    expected: ['https://site.test/a&amp;b'],
  },
  {
    /** `<` and `"` never survive `new URL` in a path, so the XML escape is belt and braces. */
    id: 'head-sitemap-percent-encodes-markup-characters',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/a"b', '/a<b'],
    expected: ['https://site.test/a%22b', 'https://site.test/a%3Cb'],
  },
  { id: 'head-sitemap-percent-encodes-a-space', src: 'janux', siteUrl: SITE, pages: ['/my page'], expected: ['https://site.test/my%20page'] },
  {
    id: 'head-sitemap-percent-encodes-non-ascii',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/café', '/日本語'],
    expected: ['https://site.test/caf%C3%A9', 'https://site.test/%E6%97%A5%E6%9C%AC%E8%AA%9E'],
  },
  { id: 'head-sitemap-keeps-a-fragment', src: 'janux', siteUrl: SITE, pages: ['/a#top'], expected: ['https://site.test/a#top'] },
  {
    /** Root-relative pages ignore the site's base path; a bare relative one is joined to it. */
    id: 'head-sitemap-resolves-against-a-site-base-path',
    src: 'janux',
    siteUrl: 'https://site.test/sub/',
    pages: ['/page', 'rel-page'],
    expected: ['https://site.test/page', 'https://site.test/sub/rel-page'],
  },
  {
    id: 'head-sitemap-keeps-the-site-port',
    src: 'janux',
    siteUrl: 'https://site.test:8443',
    pages: ['/a'],
    expected: ['https://site.test:8443/a'],
  },
  {
    /** An already-absolute page wins over the site origin — a proxied section stays where it is. */
    id: 'head-sitemap-absolute-page-keeps-its-own-origin',
    src: 'janux',
    siteUrl: SITE,
    pages: ['https://other.test/x'],
    expected: ['https://other.test/x'],
  },
  { id: 'head-sitemap-no-pages-at-all', src: 'janux', siteUrl: SITE, pages: [], expected: [] },
  {
    id: 'head-sitemap-mixed-concrete-and-dynamic',
    src: 'janux',
    siteUrl: SITE,
    pages: ['/', '/about', '/blog/hello', '/blog/[slug]', '/docs/[...path]'],
    expected: ['https://site.test/', 'https://site.test/about', 'https://site.test/blog/hello'],
  },
];
