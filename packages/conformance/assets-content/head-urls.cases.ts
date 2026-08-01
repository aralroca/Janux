import type { Case } from '../support/case';

/**
 * Making a social URL absolute, or refusing to guess.
 *
 * Open Graph and `<link rel=canonical>` are the two places on a page where a
 * relative URL is not merely untidy but wrong: the crawler that reads them is
 * not on the page, so `/og.png` resolves against nothing. Janux therefore
 * resolves against the configured `siteUrl`, and when there is none it drops
 * the tag with a warning rather than emitting a link that resolves to the
 * scraper's own host.
 *
 * "Already absolute" means `scheme://` specifically. A scheme without an
 * authority — `mailto:`, `data:` — is *not* recognised by that test, so it takes
 * the resolve path instead; `new URL` then hands it back unchanged, which is
 * the right answer by a different route. Without a `siteUrl` those same values
 * are dropped, and that asymmetry is the reason these rows exist.
 */
export interface HeadUrlCase {
  /** The `image` or `canonical` value a route's `meta` returned. */
  value: string | undefined;
  siteUrl: string | undefined;
  /** The absolute URL, or `undefined` when the tag must be dropped. */
  expected: string | undefined;
}

export type HeadUrlRow = Case<HeadUrlCase>;

const SITE = 'https://site.test';

export const HEAD_URL_CASES: HeadUrlRow[] = [
  // Already absolute: returned untouched, siteUrl or not.
  { id: 'head-url-https-untouched', src: 'janux', value: 'https://cdn.test/og.png', siteUrl: SITE, expected: 'https://cdn.test/og.png' },
  { id: 'head-url-https-untouched-without-a-site', src: 'janux', value: 'https://cdn.test/a.png', siteUrl: undefined, expected: 'https://cdn.test/a.png' },
  { id: 'head-url-http-untouched', src: 'janux', value: 'http://cdn.test/og.png', siteUrl: undefined, expected: 'http://cdn.test/og.png' },
  { id: 'head-url-ftp-untouched', src: 'janux', value: 'ftp://files.test/og.png', siteUrl: undefined, expected: 'ftp://files.test/og.png' },
  {
    /** Not normalised: an absolute URL is passed through exactly as authored. */
    id: 'head-url-uppercase-scheme-is-not-normalised',
    src: 'janux',
    value: 'HTTPS://SITE.TEST/A.PNG',
    siteUrl: undefined,
    expected: 'HTTPS://SITE.TEST/A.PNG',
  },

  // Resolved against siteUrl.
  { id: 'head-url-root-relative', src: 'janux', value: '/og.png', siteUrl: SITE, expected: 'https://site.test/og.png' },
  {
    /** Root-relative means root: the site's own base path is not prepended. */
    id: 'head-url-root-relative-ignores-the-site-path',
    src: 'janux',
    value: '/og.png',
    siteUrl: 'https://site.test/deep/path/',
    expected: 'https://site.test/og.png',
  },
  { id: 'head-url-document-relative', src: 'janux', value: 'og.png', siteUrl: 'https://site.test/blog/post/', expected: 'https://site.test/blog/post/og.png' },
  { id: 'head-url-parent-relative', src: 'janux', value: '../og.png', siteUrl: 'https://site.test/blog/post/', expected: 'https://site.test/blog/og.png' },
  {
    /** No trailing slash means the last segment is a file, and a sibling replaces it. */
    id: 'head-url-relative-to-a-site-without-a-trailing-slash',
    src: 'janux',
    value: 'og.png',
    siteUrl: 'https://site.test/blog/post',
    expected: 'https://site.test/blog/og.png',
  },
  { id: 'head-url-site-port-is-kept', src: 'janux', value: '/og.png', siteUrl: 'https://site.test:8443/base', expected: 'https://site.test:8443/og.png' },
  { id: 'head-url-query-and-fragment-survive', src: 'janux', value: '/og.png?v=2#top', siteUrl: SITE, expected: 'https://site.test/og.png?v=2#top' },
  { id: 'head-url-query-only-keeps-the-path', src: 'janux', value: '?q=1', siteUrl: 'https://site.test/p', expected: 'https://site.test/p?q=1' },
  { id: 'head-url-fragment-only-keeps-the-path', src: 'janux', value: '#top', siteUrl: 'https://site.test/a/b', expected: 'https://site.test/a/b#top' },
  { id: 'head-url-space-is-encoded', src: 'janux', value: '/my og.png', siteUrl: SITE, expected: 'https://site.test/my%20og.png' },
  { id: 'head-url-non-ascii-is-encoded', src: 'janux', value: '/café.png', siteUrl: SITE, expected: 'https://site.test/caf%C3%A9.png' },
  {
    /**
     * `//host` has no scheme, so it is not "already absolute" — it is resolved,
     * and inherits the site's scheme. Dropped entirely without one, which is
     * the safe half of the same rule.
     */
    id: 'head-url-protocol-relative-inherits-the-site-scheme',
    src: 'janux',
    value: '//cdn.test/og.png',
    siteUrl: SITE,
    expected: 'https://cdn.test/og.png',
  },
  { id: 'head-url-protocol-relative-dropped-without-a-site', src: 'janux', value: '//cdn.test/og.png', siteUrl: undefined, expected: undefined },
  {
    /** A scheme without `//` is not recognised as absolute, but `new URL` returns it intact anyway. */
    id: 'head-url-mailto-survives-the-resolve-path',
    src: 'janux',
    value: 'mailto:hi@site.test',
    siteUrl: SITE,
    expected: 'mailto:hi@site.test',
  },
  { id: 'head-url-mailto-dropped-without-a-site', src: 'janux', value: 'mailto:hi@site.test', siteUrl: undefined, expected: undefined },
  { id: 'head-url-data-uri-survives-the-resolve-path', src: 'janux', value: 'data:image/png;base64,iVBOR', siteUrl: SITE, expected: 'data:image/png;base64,iVBOR' },
  { id: 'head-url-data-uri-dropped-without-a-site', src: 'janux', value: 'data:image/png;base64,iVBOR', siteUrl: undefined, expected: undefined },

  // Nothing to resolve.
  { id: 'head-url-relative-dropped-without-a-site', src: 'janux', value: '/og.png', siteUrl: undefined, expected: undefined },
  { id: 'head-url-undefined-value', src: 'janux', value: undefined, siteUrl: SITE, expected: undefined },
  {
    /** An empty string is an absent value, not a link to the site root. */
    id: 'head-url-empty-value',
    src: 'janux',
    value: '',
    siteUrl: SITE,
    expected: undefined,
  },
];
