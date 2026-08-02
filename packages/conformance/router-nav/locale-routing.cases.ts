import type { Case } from '../support/case';

/**
 * Locale-prefixed routing: `splitLocale` (the prefix grammar), `detectLocale`
 * (cookie → accept-language → default, per docs guide/i18n.md), `localeDir`
 * (the `<html dir>` value) and the composition with the file-system router the
 * server performs on every localized request. Accept-language rows follow
 * RFC 7231 §5.3.5 — quality values order preference and `q=0` means "not
 * acceptable" — and `next:i18n#locale-detection`.
 */

/** `splitLocale(path, locales)` → the extracted prefix and the remainder. */
export interface SplitCase {
  path: string;
  locales: string[];
  /** `null` when the first segment is not a supported locale. */
  locale: string | null;
  rest: string;
}

export type SplitRow = Case<SplitCase>;

export const SPLIT_CASES: SplitRow[] = [
  { id: 'loc-split-prefix-and-remainder', src: 'next:i18n#prefix', path: '/es/shop', locales: ['en', 'es'], locale: 'es', rest: '/shop' },
  { id: 'loc-split-bare-locale-is-the-index', src: 'janux', path: '/en', locales: ['en', 'es'], locale: 'en', rest: '/' },
  { id: 'loc-split-bare-locale-with-trailing-slash', src: 'janux', path: '/en/', locales: ['en', 'es'], locale: 'en', rest: '/' },
  { id: 'loc-split-deep-remainder-is-rejoined', src: 'janux', path: '/en/a/b/c', locales: ['en', 'es'], locale: 'en', rest: '/a/b/c' },
  { id: 'loc-split-unsupported-prefix-passes-through', src: 'janux', path: '/fr/shop', locales: ['en', 'es'], locale: null, rest: '/fr/shop' },
  { id: 'loc-split-root-has-no-locale', src: 'janux', path: '/', locales: ['en', 'es'], locale: null, rest: '/' },
  { id: 'loc-split-empty-path-stays-empty', src: 'janux', path: '', locales: ['en', 'es'], locale: null, rest: '' },
  { id: 'loc-split-prefix-is-case-sensitive', src: 'janux', path: '/ES/shop', locales: ['en', 'es'], locale: null, rest: '/ES/shop' },
  { id: 'loc-split-region-prefix-needs-an-exact-listing', src: 'janux', path: '/es-AR/x', locales: ['es'], locale: null, rest: '/es-AR/x' },
  { id: 'loc-split-region-locale-matches-exactly', src: 'janux', path: '/es-AR/x', locales: ['es-AR'], locale: 'es-AR', rest: '/x' },
  { id: 'loc-split-base-prefix-does-not-match-a-region-list', src: 'janux', path: '/en/x', locales: ['en-US', 'en-GB'], locale: null, rest: '/en/x' },
  { id: 'loc-split-only-the-first-segment-is-the-locale', src: 'janux', path: '/es/es/shop', locales: ['en', 'es'], locale: 'es', rest: '/es/shop' },
  { id: 'loc-split-locale-deeper-in-the-path-is-ignored', src: 'janux', path: '/shop/es', locales: ['en', 'es'], locale: null, rest: '/shop/es' },
  { id: 'loc-split-doubled-leading-slash-defeats-the-prefix', src: 'janux', path: '//es/shop', locales: ['en', 'es'], locale: null, rest: '//es/shop' },
  { id: 'loc-split-empty-locale-list-never-splits', src: 'janux', path: '/es/shop', locales: [], locale: null, rest: '/es/shop' },
  { id: 'loc-split-longer-first-segment-is-not-a-prefix-match', src: 'janux', path: '/esx/shop', locales: ['es'], locale: null, rest: '/esx/shop' },
  { id: 'loc-split-locale-glued-to-a-word-does-not-split', src: 'janux', path: '/eshop', locales: ['es'], locale: null, rest: '/eshop' },
  { id: 'loc-split-encoded-prefix-is-not-decoded', src: 'janux', path: '/%65s/shop', locales: ['es'], locale: null, rest: '/%65s/shop' },
  { id: 'loc-split-remainder-keeps-encoded-segments', src: 'janux', path: '/es/caf%C3%A9', locales: ['en', 'es'], locale: 'es', rest: '/caf%C3%A9' },
  { id: 'loc-split-underscore-locale-is-honoured-verbatim', src: 'janux', path: '/en_US/x', locales: ['en_US'], locale: 'en_US', rest: '/x' },
  { id: 'loc-split-numeric-region-locale', src: 'janux', path: '/es-419/x', locales: ['es-419'], locale: 'es-419', rest: '/x' },
  { id: 'loc-split-inner-double-slash-is-preserved', src: 'janux', path: '/es//shop', locales: ['es'], locale: 'es', rest: '//shop' },
  { id: 'loc-split-dot-dot-remainder-is-not-resolved', src: 'janux', path: '/es/..', locales: ['es'], locale: 'es', rest: '/..' },
];

/** `detectLocale(request, config)` for an unprefixed request. */
export interface DetectCase {
  cookie: string | null;
  accept: string | null;
  locales: string[];
  defaultLocale: string;
  locale: string;
}

export type DetectRow = Case<DetectCase>;

const DETECTS: [string, string, string | null, string | null, string[], string, string][] = [
  // [id-suffix, src, cookie, accept-language, locales, defaultLocale, expected]
  // ── the JANUX_LOCALE cookie ─────────────────────────────────────────────────
  ['cookie-wins-over-accept-language', 'next:i18n#cookie-priority', 'JANUX_LOCALE=es', 'en', ['en', 'es'], 'en', 'es'],
  ['unsupported-cookie-falls-to-accept-language', 'janux', 'JANUX_LOCALE=fr', 'es', ['en', 'es'], 'en', 'es'],
  ['cookie-value-is-case-sensitive', 'janux', 'JANUX_LOCALE=ES', null, ['en', 'es'], 'en', 'en'],
  ['cookie-parses-among-other-cookies', 'janux', 'a=1; JANUX_LOCALE=es; b=2', null, ['en', 'es'], 'en', 'es'],
  ['cookie-parses-without-a-space-after-the-semicolon', 'janux', 'a=1;JANUX_LOCALE=es', null, ['en', 'es'], 'en', 'es'],
  ['cookie-name-must-match-exactly', 'janux', 'XJANUX_LOCALE=es', null, ['en', 'es'], 'en', 'en'],
  ['first-cookie-occurrence-wins', 'janux', 'JANUX_LOCALE=es; JANUX_LOCALE=en', null, ['en', 'es'], 'en', 'es'],
  ['quoted-cookie-value-is-not-unquoted', 'janux', 'JANUX_LOCALE="es"', null, ['en', 'es'], 'en', 'en'],
  ['empty-cookie-value-is-ignored', 'janux', 'JANUX_LOCALE=', 'es', ['en', 'es'], 'en', 'es'],
  ['region-cookie-is-honoured', 'janux', 'JANUX_LOCALE=en-GB', null, ['en-GB', 'es'], 'es', 'en-GB'],
  ['cookie-value-with-an-equals-sign-is-taken-verbatim', 'janux', 'JANUX_LOCALE=e=s', null, ['en', 'es'], 'en', 'en'],
  ['cookie-parses-after-a-tab-separator', 'janux', 'a=1;\tJANUX_LOCALE=es', null, ['en', 'es'], 'en', 'es'],
  // ── accept-language tag matching ────────────────────────────────────────────
  ['simple-tag', 'janux', null, 'es', ['en', 'es'], 'en', 'es'],
  ['quality-parameter-is-stripped-from-the-tag', 'janux', null, 'es;q=0.9', ['en', 'es'], 'en', 'es'],
  ['unsupported-tags-are-skipped', 'janux', null, 'fr,de,es', ['en', 'es'], 'en', 'es'],
  ['header-order-decides-between-equals', 'janux', null, 'es,en', ['en', 'es'], 'en', 'es'],
  ['wildcard-is-skipped', 'janux', null, '*,es', ['en', 'es'], 'en', 'es'],
  ['only-a-wildcard-falls-to-the-default', 'janux', null, '*', ['en', 'es'], 'en', 'en'],
  ['tag-matching-is-case-insensitive', 'janux', null, 'ES', ['en', 'es'], 'en', 'es'],
  ['region-tag-matches-the-exact-region-locale', 'janux', null, 'en-us', ['en-US', 'es'], 'es', 'en-US'],
  ['region-tag-falls-back-to-the-base-locale', 'next:i18n#base-fallback', null, 'en-GB', ['en', 'es'], 'es', 'en'],
  ['base-tag-expands-to-a-region-locale', 'next:i18n#region-expansion', null, 'en', ['en-US', 'es'], 'es', 'en-US'],
  ['base-tag-picks-the-first-region-listed', 'janux', null, 'en', ['en-GB', 'en-US'], 'en-US', 'en-GB'],
  ['exact-region-beats-base-expansion', 'janux', null, 'en-us', ['en', 'en-US'], 'en', 'en-US'],
  ['spaces-around-tags-are-trimmed', 'janux', null, ' es , en ', ['en', 'es'], 'en', 'es'],
  ['empty-header-falls-to-the-default', 'janux', null, '', ['en', 'es'], 'es', 'es'],
  ['missing-header-falls-to-the-default', 'janux', null, null, ['en', 'es'], 'es', 'es'],
  ['semicolons-only-header-falls-to-the-default', 'janux', null, ';;;', ['en', 'es'], 'en', 'en'],
  ['latam-region-tag-falls-to-the-base', 'janux', null, 'es-419', ['es', 'en'], 'en', 'es'],
  ['script-subtag-falls-to-the-base', 'janux', null, 'zh-Hans-CN', ['zh', 'en'], 'en', 'zh'],
  // ── quality values order preference (RFC 7231 §5.3.5) ───────────────────────
  ['higher-quality-wins-over-header-order', 'next:i18n#quality-order', null, 'en;q=0.5,es', ['en', 'es'], 'en', 'es'],
  ['quality-zero-means-not-acceptable', 'next:i18n#quality-zero', null, 'es;q=0,en;q=0.1', ['es', 'en'], 'es', 'en'],
  ['all-quality-zero-falls-to-the-default', 'janux', null, 'es;q=0', ['en', 'es'], 'en', 'en'],
  ['equal-quality-keeps-header-order', 'janux', null, 'es;q=0.8,en;q=0.8', ['en', 'es'], 'en', 'es'],
  ['implicit-quality-is-one', 'janux', null, 'en;q=0.9,es', ['en', 'es'], 'en', 'es'],
  ['invalid-quality-counts-as-one', 'janux', null, 'es;q=broken,en;q=0.5', ['en', 'es'], 'en', 'es'],
  ['quality-parses-among-other-parameters', 'janux', null, 'es;level=1;q=0.4,en;q=0.3', ['en', 'es'], 'en', 'es'],
  ['wildcard-with-high-quality-is-still-skipped', 'janux', null, '*;q=1,es;q=0.2', ['en', 'es'], 'en', 'es'],
  ['unsupported-high-quality-does-not-block', 'janux', null, 'fr;q=1,es;q=0.1', ['en', 'es'], 'en', 'es'],
  ['quality-reorders-region-fallbacks', 'janux', null, 'en-GB;q=0.3,es-MX;q=0.9', ['en', 'es'], 'en', 'es'],
  ['uppercase-q-parameter-is-recognised', 'janux', null, 'es;Q=0.1,en;q=0.5', ['en', 'es'], 'en', 'en'],
  ['negative-quality-is-malformed-so-counts-as-one', 'janux', null, 'es;q=-1,en;q=0.5', ['en', 'es'], 'en', 'es'],
  ['quality-above-one-is-tolerated', 'janux', null, 'es;q=9,en', ['en', 'es'], 'en', 'es'],
  ['tiny-quality-still-ranks-below', 'janux', null, 'es;q=0.001,en;q=0.9', ['en', 'es'], 'en', 'en'],
  ['full-form-quality-one-point-zero-zero-zero', 'janux', null, 'es;q=0.999,en;q=1.000', ['en', 'es'], 'es', 'en'],
  ['empty-header-entries-are-skipped', 'janux', null, 'es,,en', ['en', 'es'], 'en', 'es'],
  ['all-tags-unsupported-falls-to-the-default', 'janux', null, 'fr,de,it', ['en', 'es'], 'es', 'es'],
  ['docs-example-pt-expands-to-pt-br', 'janux', null, 'pt', ['pt-BR', 'en'], 'en', 'pt-BR'],
  // ── headers real browsers send ──────────────────────────────────────────────
  ['chrome-default-english-header', 'janux', null, 'en-US,en;q=0.9', ['en', 'es'], 'es', 'en'],
  ['spanish-browser-with-english-fallback', 'janux', null, 'es-ES,es;q=0.9,en;q=0.8', ['en', 'es'], 'en', 'es'],
  ['french-browser-on-a-site-without-french', 'janux', null, 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7', ['en', 'es'], 'es', 'en'],
  ['latam-spanish-browser', 'janux', null, 'es-419,es;q=0.9', ['es', 'en'], 'en', 'es'],
  ['firefox-spanish-on-an-english-only-site', 'janux', null, 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3', ['en', 'fr'], 'fr', 'en'],
  ['edge-british-english-header', 'janux', null, 'en-GB,en;q=0.9,en-US;q=0.8', ['en-US', 'en-GB'], 'en-US', 'en-GB'],
  ['android-chinese-header', 'janux', null, 'zh-CN,zh;q=0.9', ['zh', 'en'], 'en', 'zh'],
  ['scandinavian-cascade-lands-on-the-first-supported', 'janux', null, 'da,nb;q=0.9,sv;q=0.8,es;q=0.7,en;q=0.6', ['en', 'es'], 'en', 'es'],
];

export const DETECT_CASES: DetectRow[] = DETECTS.map(([label, src, cookie, accept, locales, defaultLocale, locale]) => ({
  id: `loc-detect-${label}`,
  src,
  cookie,
  accept,
  locales,
  defaultLocale,
  locale,
}));

/**
 * `localeDir(locale)` — the tag *shapes* that must still resolve to a
 * direction. The per-language RTL set itself is pinned by the i18n area
 * (`i18n/locale-paths.cases.ts`); these rows cover region subtags, case
 * folding and the set boundary, which it does not.
 */
export interface DirCase {
  locale: string;
  dir: 'ltr' | 'rtl';
}

export type DirRow = Case<DirCase>;

const DIRS: [string, string, 'ltr' | 'rtl'][] = [
  ['hebrew-with-region', 'he-IL', 'rtl'],
  ['persian-with-region', 'fa-IR', 'rtl'],
  ['mixed-case-region-tag', 'He-IL', 'rtl'],
  ['spanish', 'es', 'ltr'],
  ['chinese', 'zh', 'ltr'],
  ['russian', 'ru', 'ltr'],
  ['english-with-region', 'en-US', 'ltr'],
  ['sorani-code-is-outside-the-set', 'ckb', 'ltr'],
];

export const DIR_CASES: DirRow[] = DIRS.map(([label, locale, dir]) => ({
  id: `loc-dir-${label}`,
  src: 'janux',
  locale,
  dir,
}));

/**
 * The composition the server runs per request: split the locale prefix, then
 * match the remainder against the file-system routes (fixture
 * `__fixtures__/routes`, locales `en`/`es`).
 */
export interface LocaleMatchCase {
  path: string;
  locale: string | null;
  pattern: string | null;
  params?: Record<string, string>;
}

export type LocaleMatchRow = Case<LocaleMatchCase>;

export const LOCALE_MATCH_CASES: LocaleMatchRow[] = [
  { id: 'loc-match-prefixed-static-route', src: 'next:i18n#localized-routing', path: '/es/about', locale: 'es', pattern: '/about' },
  { id: 'loc-match-prefixed-index', src: 'janux', path: '/en', locale: 'en', pattern: '/' },
  { id: 'loc-match-prefixed-dynamic-route', src: 'janux', path: '/es/blog/hello', locale: 'es', pattern: '/blog/[slug]', params: { slug: 'hello' } },
  { id: 'loc-match-prefixed-encoded-param', src: 'janux', path: '/es/blog/caf%C3%A9', locale: 'es', pattern: '/blog/[slug]', params: { slug: 'café' } },
  { id: 'loc-match-param-that-looks-like-a-locale', src: 'janux', path: '/es/blog/en', locale: 'es', pattern: '/blog/[slug]', params: { slug: 'en' } },
  { id: 'loc-match-unprefixed-path-matches-without-a-locale', src: 'janux', path: '/about', locale: null, pattern: '/about' },
  { id: 'loc-match-unsupported-prefix-is-a-plain-404', src: 'janux', path: '/fr/about', locale: null, pattern: null },
  { id: 'loc-match-encoded-prefix-neither-splits-nor-matches', src: 'janux', path: '/%65s/about', locale: null, pattern: null },
  { id: 'loc-match-catchall-arity-holds-under-a-locale', src: 'janux', path: '/es/files', locale: 'es', pattern: null },
  { id: 'loc-match-rest-route-under-a-locale', src: 'janux', path: '/en/files/a/b', locale: 'en', pattern: '/files/[...path]', params: { path: 'a/b' } },
  { id: 'loc-match-group-route-under-a-locale', src: 'janux', path: '/es/pricing', locale: 'es', pattern: '/pricing' },
  { id: 'loc-match-typed-route-under-a-locale', src: 'janux', path: '/en/users/42', locale: 'en', pattern: '/users/[id=integer]', params: { id: '42' } },
  { id: 'loc-match-optional-catchall-zero-under-a-locale', src: 'janux', path: '/es/wild', locale: 'es', pattern: '/wild/[[...rest]]', params: { rest: '' } },
];
