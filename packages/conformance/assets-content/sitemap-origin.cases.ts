import type { Case } from '../support/case';

/**
 * The origin both `sitemap.xml` and `robots.txt` hang off.
 *
 * `siteUrl` feeds `new URL()` in three places — the sitemap, robots.txt and
 * every page's social tags — so a typo like `janux.build` (no scheme) would
 * throw on every request and take the whole site down. It is therefore checked
 * once at startup and, when it does not parse, dropped with a warning: the two
 * files 404 and the pages lose their social URLs, which is a bad day rather
 * than an outage.
 *
 * `robots.txt` points at the sitemap from the *origin* root even when the site
 * is served under a base path, because that is where the server actually routes
 * it — a `Sitemap:` line under the base path would 404.
 */
export interface SiteOriginCase {
  siteUrl: string | undefined;
  /** The normalised origin, or `undefined` when it is refused. */
  normalized: string | undefined;
  /** The `Sitemap:` line robots.txt would carry, or `undefined` when there is no origin. */
  sitemapLine: string | undefined;
}

export type SiteOriginRow = Case<SiteOriginCase>;

export const SITE_ORIGIN_CASES: SiteOriginRow[] = [
  {
    /** `new URL` adds the empty path, so a bare origin comes back with its slash. */
    id: 'head-origin-bare-https-gains-a-slash',
    src: 'janux',
    siteUrl: 'https://site.test',
    normalized: 'https://site.test/',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-http-is-accepted',
    src: 'janux',
    siteUrl: 'http://site.test',
    normalized: 'http://site.test/',
    sitemapLine: 'http://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-trailing-slash-is-not-doubled',
    src: 'janux',
    siteUrl: 'https://site.test/',
    normalized: 'https://site.test/',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    /** The base path is kept for page URLs, but the sitemap still lives at the origin root. */
    id: 'head-origin-base-path-is-kept-but-not-by-robots',
    src: 'janux',
    siteUrl: 'https://site.test/base',
    normalized: 'https://site.test/base',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-deep-base-path',
    src: 'janux',
    siteUrl: 'https://site.test/sub/dir',
    normalized: 'https://site.test/sub/dir',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-port-is-kept',
    src: 'janux',
    siteUrl: 'https://site.test:8443',
    normalized: 'https://site.test:8443/',
    sitemapLine: 'https://site.test:8443/sitemap.xml',
  },
  {
    /** The scheme and host are lowercased by URL parsing; nothing else is. */
    id: 'head-origin-scheme-and-host-are-lowercased',
    src: 'janux',
    siteUrl: 'HTTPS://SITE.TEST',
    normalized: 'https://site.test/',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-query-survives-normalisation',
    src: 'janux',
    siteUrl: 'https://site.test?a=1',
    normalized: 'https://site.test/?a=1',
    sitemapLine: 'https://site.test/sitemap.xml',
  },
  {
    id: 'head-origin-userinfo-survives-normalisation',
    src: 'janux',
    siteUrl: 'https://user:pw@site.test',
    normalized: 'https://user:pw@site.test/',
    sitemapLine: 'https://user:pw@site.test/sitemap.xml',
  },
  {
    /** Any parseable absolute URL counts — the check is "does `new URL` accept it", not a scheme list. */
    id: 'head-origin-non-http-scheme-is-still-absolute',
    src: 'janux',
    siteUrl: 'file:///x',
    normalized: 'file:///x',
    sitemapLine: 'file:///sitemap.xml',
  },
  {
    /** The typo this check exists for: valid-looking, and fatal in three places. */
    id: 'head-origin-missing-scheme-is-refused',
    src: 'janux',
    siteUrl: 'janux.build',
    normalized: undefined,
    sitemapLine: undefined,
  },
  {
    id: 'head-origin-protocol-relative-is-refused',
    src: 'janux',
    siteUrl: '//site.test',
    normalized: undefined,
    sitemapLine: undefined,
  },
  {
    id: 'head-origin-root-relative-is-refused',
    src: 'janux',
    siteUrl: '/base',
    normalized: undefined,
    sitemapLine: undefined,
  },
  {
    id: 'head-origin-whitespace-is-refused',
    src: 'janux',
    siteUrl: '   ',
    normalized: undefined,
    sitemapLine: undefined,
  },
  {
    /** Unset is not a typo, so it is refused without a warning. */
    id: 'head-origin-empty-string-is-unset',
    src: 'janux',
    siteUrl: '',
    normalized: undefined,
    sitemapLine: undefined,
  },
  {
    id: 'head-origin-undefined-is-unset',
    src: 'janux',
    siteUrl: undefined,
    normalized: undefined,
    sitemapLine: undefined,
  },
];
