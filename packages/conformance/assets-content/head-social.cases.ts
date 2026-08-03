import type { PageMeta } from 'janux';
import type { HeadContext } from '../../janux-server/src/head-tags';
import type { Case } from '../support/case';

/**
 * The social card a route gets for free, and how a route overrides it.
 *
 * `og:*` and `twitter:*` are *derived* — from the page's title, description,
 * image and canonical — so a route that sets those four gets a correct card
 * without naming a single social key. The `og` and `twitter` maps then override
 * key by key, and because they are spread over the derived object an override
 * of a derived key keeps that key's original position: a card's tag order is
 * stable whether or not a route customises it, which is what makes the SPA head
 * diff cheap.
 *
 * Two rules do real work here and are easy to lose in a refactor. An empty
 * string removes a tag rather than emitting `content=""` — that is the only way
 * to *drop* a derived tag. And every node carries a stable `id`, because SPA
 * navigation diffs the live head against the incoming one and a positional
 * match would re-resolve every tag after the one a page omitted.
 */
export interface HeadSocialCase {
  meta: PageMeta;
  ctx: HeadContext;
  /** The complete string `headTags` returns. */
  expected: string;
}

export type HeadSocialRow = Case<HeadSocialCase>;

const og = (key: string, content: string) => `<meta property="og:${key}" id="jx-og-${key}" content="${content}">`;
const tw = (key: string, content: string) => `<meta name="twitter:${key}" id="jx-twitter-${key}" content="${content}">`;
const SITE = 'https://site.test';

export const HEAD_SOCIAL_CASES: HeadSocialRow[] = [
  {
    /** Even an empty page states what kind of thing it is and which card to draw. */
    id: 'head-social-minimum-card-for-an-empty-page',
    src: 'janux',
    meta: {},
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary'),
  },
  {
    id: 'head-social-title-feeds-both-cards',
    src: 'janux',
    meta: { title: 'Hello' },
    ctx: {},
    expected: og('type', 'website') + og('title', 'Hello') + tw('card', 'summary') + tw('title', 'Hello'),
  },
  {
    id: 'head-social-description-feeds-both-cards',
    src: 'janux',
    meta: { description: 'A page' },
    ctx: {},
    expected: og('type', 'website') + og('description', 'A page') + tw('card', 'summary') + tw('description', 'A page'),
  },
  {
    /** The shell's resolved title and description are the per-site default. */
    id: 'head-social-falls-back-to-the-shell-context',
    src: 'janux',
    meta: {},
    ctx: { title: 'App', description: 'Site-wide' },
    expected:
      og('type', 'website') + og('title', 'App') + og('description', 'Site-wide') +
      tw('card', 'summary') + tw('title', 'App') + tw('description', 'Site-wide'),
  },
  {
    /** Independently: a route may own the description and inherit the title. */
    id: 'head-social-description-overrides-the-context-alone',
    src: 'janux',
    meta: { description: 'Page-specific' },
    ctx: { title: 'App', description: 'Site-wide' },
    expected:
      og('type', 'website') + og('title', 'App') + og('description', 'Page-specific') +
      tw('card', 'summary') + tw('title', 'App') + tw('description', 'Page-specific'),
  },
  {
    /** An image upgrades the Twitter card from a thumbnail to a full-width one. */
    id: 'head-social-image-upgrades-the-twitter-card',
    src: 'janux',
    meta: { title: 'T', image: 'https://cdn.test/i.png' },
    ctx: {},
    expected:
      og('type', 'website') + og('title', 'T') + og('image', 'https://cdn.test/i.png') +
      tw('card', 'summary_large_image') + tw('title', 'T') + tw('image', 'https://cdn.test/i.png'),
  },
  {
    id: 'head-social-relative-image-resolved-against-the-site',
    src: 'janux',
    meta: { image: '/i.png' },
    ctx: { siteUrl: SITE },
    expected:
      og('type', 'website') + og('image', 'https://site.test/i.png') +
      tw('card', 'summary_large_image') + tw('image', 'https://site.test/i.png'),
  },
  {
    /** Dropped rather than emitted relative — so the card falls back to the small one. */
    id: 'head-social-relative-image-without-a-site-drops-the-card-upgrade',
    src: 'janux',
    meta: { image: '/i.png' },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary'),
  },
  {
    id: 'head-social-empty-image-is-an-absent-image',
    src: 'janux',
    meta: { title: 'T', image: '' },
    ctx: { siteUrl: SITE },
    expected: og('type', 'website') + og('title', 'T') + tw('card', 'summary') + tw('title', 'T'),
  },
  {
    /** The canonical link and `og:url` are one value, so they can never disagree. */
    id: 'head-social-canonical-feeds-og-url',
    src: 'janux',
    meta: { canonical: '/page' },
    ctx: { siteUrl: SITE },
    expected:
      '<link rel="canonical" id="jx-canonical" href="https://site.test/page">' +
      og('type', 'website') + og('url', 'https://site.test/page') + tw('card', 'summary'),
  },
  {
    id: 'head-social-absolute-canonical-is-left-alone',
    src: 'janux',
    meta: { canonical: 'https://other.test/page' },
    ctx: { siteUrl: SITE },
    expected:
      '<link rel="canonical" id="jx-canonical" href="https://other.test/page">' +
      og('type', 'website') + og('url', 'https://other.test/page') + tw('card', 'summary'),
  },
  {
    /** No siteUrl, no canonical link *and* no og:url — one dropped value, both tags gone. */
    id: 'head-social-relative-canonical-without-a-site-emits-neither',
    src: 'janux',
    meta: { canonical: '/page' },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary'),
  },
  {
    id: 'head-social-robots-comes-before-the-cards',
    src: 'janux',
    meta: { robots: 'noindex, nofollow' },
    ctx: {},
    expected: '<meta name="robots" id="jx-robots" content="noindex, nofollow">' + og('type', 'website') + tw('card', 'summary'),
  },
  {
    /** Canonical, robots, og, twitter: the order every page emits, so the diff is positional-free. */
    id: 'head-social-full-tag-order',
    src: 'janux',
    meta: { title: 'T', description: 'D', canonical: '/c', robots: 'index', image: '/i.png' },
    ctx: { siteUrl: SITE },
    expected:
      '<link rel="canonical" id="jx-canonical" href="https://site.test/c">' +
      '<meta name="robots" id="jx-robots" content="index">' +
      og('type', 'website') + og('title', 'T') + og('description', 'D') +
      og('url', 'https://site.test/c') + og('image', 'https://site.test/i.png') +
      tw('card', 'summary_large_image') + tw('title', 'T') + tw('description', 'D') + tw('image', 'https://site.test/i.png'),
  },

  // Overrides.
  {
    /** An override of a derived key keeps that key's position, so the tag order never moves. */
    id: 'head-social-og-type-override-keeps-its-position',
    src: 'janux',
    meta: { title: 'T', og: { type: 'article' } },
    ctx: {},
    expected: og('type', 'article') + og('title', 'T') + tw('card', 'summary') + tw('title', 'T'),
  },
  {
    id: 'head-social-og-title-differs-from-the-page-title',
    src: 'janux',
    meta: { title: 'Page title', og: { title: 'Share title' } },
    ctx: {},
    expected: og('type', 'website') + og('title', 'Share title') + tw('card', 'summary') + tw('title', 'Page title'),
  },
  {
    /** The only way to drop a derived tag: override it with an empty string. */
    id: 'head-social-empty-override-drops-a-derived-tag',
    src: 'janux',
    meta: { title: 'T', og: { title: '' } },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary') + tw('title', 'T'),
  },
  {
    id: 'head-social-new-og-keys-append-in-insertion-order',
    src: 'janux',
    meta: { og: { locale: 'en_US', site_name: 'Janux' } },
    ctx: {},
    expected: og('type', 'website') + og('locale', 'en_US') + og('site_name', 'Janux') + tw('card', 'summary'),
  },
  {
    /** Unprefixed keys are the contract, but an already-prefixed one must not become `og:og:type`. */
    id: 'head-social-already-prefixed-og-key',
    src: 'janux',
    meta: { og: { 'og:locale': 'es_ES' } },
    ctx: {},
    expected: og('type', 'website') + og('locale', 'es_ES') + tw('card', 'summary'),
  },
  {
    id: 'head-social-already-prefixed-twitter-key',
    src: 'janux',
    meta: { twitter: { 'twitter:creator': '@aralroca' } },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary') + tw('creator', '@aralroca'),
  },
  {
    /** Only the leading prefix is stripped, so a key that merely contains it survives whole. */
    id: 'head-social-key-containing-the-prefix-is-not-stripped',
    src: 'janux',
    meta: { og: { 'video:og:duration': '30' } },
    ctx: {},
    expected: og('type', 'website') + og('video:og:duration', '30') + tw('card', 'summary'),
  },
  {
    id: 'head-social-twitter-site-appends',
    src: 'janux',
    meta: { title: 'T', twitter: { site: '@janux' } },
    ctx: {},
    expected: og('type', 'website') + og('title', 'T') + tw('card', 'summary') + tw('title', 'T') + tw('site', '@janux'),
  },
  {
    id: 'head-social-twitter-card-override-beats-the-derived-one',
    src: 'janux',
    meta: { image: 'https://cdn.test/i.png', twitter: { card: 'app' } },
    ctx: {},
    expected:
      og('type', 'website') + og('image', 'https://cdn.test/i.png') +
      tw('card', 'app') + tw('image', 'https://cdn.test/i.png'),
  },
  {
    id: 'head-social-og-url-override-beats-the-canonical',
    src: 'janux',
    meta: { canonical: '/c', og: { url: 'https://other.test/x' } },
    ctx: { siteUrl: SITE },
    expected:
      '<link rel="canonical" id="jx-canonical" href="https://site.test/c">' +
      og('type', 'website') + og('url', 'https://other.test/x') + tw('card', 'summary'),
  },
  {
    /** The two maps are independent: a page may share one title on OG and another on Twitter. */
    id: 'head-social-og-and-twitter-override-independently',
    src: 'janux',
    meta: { title: 'T', og: { title: 'For Facebook' }, twitter: { title: 'For X' } },
    ctx: {},
    expected: og('type', 'website') + og('title', 'For Facebook') + tw('card', 'summary') + tw('title', 'For X'),
  },
  {
    /** An override is not resolved against `siteUrl` — the map is taken as written. */
    id: 'head-social-og-image-override-is-not-resolved',
    src: 'janux',
    meta: { image: '/derived.png', og: { image: '/raw.png' } },
    ctx: { siteUrl: SITE },
    expected:
      og('type', 'website') + og('image', '/raw.png') +
      tw('card', 'summary_large_image') + tw('image', 'https://site.test/derived.png'),
  },

  // Typed keys.
  {
    /** CamelCase spellings exist for the properties a typed literal key cannot name. */
    id: 'head-social-camelcase-og-aliases',
    src: 'janux',
    meta: { og: { siteName: 'Janux', imageAlt: 'Poster' } },
    ctx: {},
    expected: og('type', 'website') + og('site_name', 'Janux') + og('image:alt', 'Poster') + tw('card', 'summary'),
  },
  {
    /** `article:*` is its own vocabulary: the alias escapes the `og:` prefix entirely. */
    id: 'head-social-article-times-escape-the-og-prefix',
    src: 'janux',
    meta: { og: { publishedTime: '2026-07-01' } },
    ctx: {},
    expected:
      og('type', 'website') +
      '<meta property="article:published_time" id="jx-article-published_time" content="2026-07-01">' +
      tw('card', 'summary'),
  },
  {
    id: 'head-social-twitter-image-alt-alias',
    src: 'janux',
    meta: { twitter: { imageAlt: 'Poster' } },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary') + tw('image:alt', 'Poster'),
  },
  {
    /** A typed robots object serializes in one stable order, so the tag never reorders. */
    id: 'head-social-typed-robots-object',
    src: 'janux',
    meta: { robots: { index: false, follow: false, maxImagePreview: 'none' } },
    ctx: {},
    expected:
      '<meta name="robots" id="jx-robots" content="noindex, nofollow, max-image-preview:none">' +
      og('type', 'website') +
      tw('card', 'summary'),
  },
  {
    /** An empty robots object asks for nothing, so nothing is emitted. */
    id: 'head-social-empty-robots-object',
    src: 'janux',
    meta: { robots: {} },
    ctx: {},
    expected: og('type', 'website') + tw('card', 'summary'),
  },

  // Escaping.
  {
    /** Quotes would close the attribute, `<` would open a tag; `>` needs neither. */
    id: 'head-social-content-is-escaped',
    src: 'janux',
    meta: { title: 'A "quoted" <b>title</b> & more' },
    ctx: {},
    expected:
      og('type', 'website') + og('title', 'A &quot;quoted&quot; &lt;b>title&lt;/b> &amp; more') +
      tw('card', 'summary') + tw('title', 'A &quot;quoted&quot; &lt;b>title&lt;/b> &amp; more'),
  },
  {
    /** Already-escaped text is escaped again: the input is text, never markup. */
    id: 'head-social-existing-entities-are-re-escaped',
    src: 'janux',
    meta: { description: 'AT&amp;T' },
    ctx: {},
    expected: og('type', 'website') + og('description', 'AT&amp;amp;T') + tw('card', 'summary') + tw('description', 'AT&amp;amp;T'),
  },
  {
    id: 'head-social-non-ascii-content-is-not-escaped',
    src: 'janux',
    meta: { title: 'Café ✓ 日本語' },
    ctx: {},
    expected: og('type', 'website') + og('title', 'Café ✓ 日本語') + tw('card', 'summary') + tw('title', 'Café ✓ 日本語'),
  },
  {
    /** A key is interpolated into both an attribute value and an id, so it is escaped in both. */
    id: 'head-social-override-key-is-escaped',
    src: 'janux',
    meta: { og: { 'a"b': 'v' } },
    ctx: {},
    expected: og('type', 'website') + '<meta property="og:a&quot;b" id="jx-og-a&quot;b" content="v">' + tw('card', 'summary'),
  },
  {
    id: 'head-social-robots-content-is-escaped',
    src: 'janux',
    meta: { robots: 'noindex, max-snippet:-1, unavailable_after: 2026-07-31T00:00:00"' },
    ctx: {},
    expected:
      '<meta name="robots" id="jx-robots" content="noindex, max-snippet:-1, unavailable_after: 2026-07-31T00:00:00&quot;">' +
      og('type', 'website') + tw('card', 'summary'),
  },
  {
    id: 'head-social-canonical-href-is-escaped',
    src: 'janux',
    meta: { canonical: '/search?q=a&b=1' },
    ctx: { siteUrl: SITE },
    expected:
      '<link rel="canonical" id="jx-canonical" href="https://site.test/search?q=a&amp;b=1">' +
      og('type', 'website') + og('url', 'https://site.test/search?q=a&amp;b=1') + tw('card', 'summary'),
  },
];
