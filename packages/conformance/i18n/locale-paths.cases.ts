import type { Case } from '../support/case';

/**
 * URL locale prefixes and text direction.
 *
 * `splitLocale` only ever inspects the first slash-delimited segment, matched
 * case-sensitively against the configured list — so `/ES/shop` is not a locale
 * path, `/es/es/shop` peels exactly one prefix, and a path without a leading
 * slash never splits. `localeDir` keys off the base language of the tag,
 * case-insensitively, against the RTL set.
 */
export interface SplitLocaleCase {
  pathname: string;
  locales: string[];
  expected: { locale?: string; pathname: string };
}

export type SplitLocaleRow = Case<SplitLocaleCase>;

export const SPLIT_LOCALE_CASES: SplitLocaleRow[] = [
  { id: 'i18n-path-splits-a-locale-prefix', src: 'janux', pathname: '/es/shop', locales: ['en', 'es'], expected: { locale: 'es', pathname: '/shop' } },
  { id: 'i18n-path-a-bare-locale-maps-to-the-root', src: 'janux', pathname: '/es', locales: ['en', 'es'], expected: { locale: 'es', pathname: '/' } },
  { id: 'i18n-path-an-unprefixed-path-is-untouched', src: 'janux', pathname: '/shop', locales: ['en', 'es'], expected: { pathname: '/shop' } },
  { id: 'i18n-path-the-root-is-untouched', src: 'janux', pathname: '/', locales: ['en', 'es'], expected: { pathname: '/' } },
  { id: 'i18n-path-an-empty-path-is-untouched', src: 'janux', pathname: '', locales: ['en', 'es'], expected: { pathname: '' } },
  { id: 'i18n-path-the-prefix-is-case-sensitive', src: 'janux', pathname: '/ES/shop', locales: ['en', 'es'], expected: { pathname: '/ES/shop' } },
  { id: 'i18n-path-only-one-prefix-is-peeled', src: 'janux', pathname: '/es/es/shop', locales: ['en', 'es'], expected: { locale: 'es', pathname: '/es/shop' } },
  { id: 'i18n-path-regional-locales-split-too', src: 'janux', pathname: '/pt-BR/x', locales: ['pt-BR'], expected: { locale: 'pt-BR', pathname: '/x' } },
  { id: 'i18n-path-a-trailing-slash-after-the-locale-is-the-root', src: 'janux', pathname: '/en/', locales: ['en'], expected: { locale: 'en', pathname: '/' } },
  { id: 'i18n-path-a-trailing-slash-survives-the-split', src: 'janux', pathname: '/es/shop/', locales: ['es'], expected: { locale: 'es', pathname: '/shop/' } },
  { id: 'i18n-path-no-leading-slash-never-splits', src: 'janux', pathname: 'es/shop', locales: ['es'], expected: { pathname: 'es/shop' } },
  { id: 'i18n-path-a-deeper-locale-segment-is-not-a-prefix', src: 'janux', pathname: '/shop/es', locales: ['es'], expected: { pathname: '/shop/es' } },
  { id: 'i18n-path-an-empty-locale-list-never-splits', src: 'janux', pathname: '/es/x', locales: [], expected: { pathname: '/es/x' } },
  { id: 'i18n-path-deep-paths-keep-every-segment', src: 'janux', pathname: '/es/a/b/c', locales: ['es'], expected: { locale: 'es', pathname: '/a/b/c' } },
];

export interface LocaleDirCase {
  locale: string;
  dir: 'ltr' | 'rtl';
}

export type LocaleDirRow = Case<LocaleDirCase>;

/** The full RTL set, plus the region/case shapes that must not change the answer. */
const DIRECTIONS: [string, 'ltr' | 'rtl'][] = [
  ['ar', 'rtl'], ['he', 'rtl'], ['fa', 'rtl'], ['ur', 'rtl'], ['ps', 'rtl'],
  ['sd', 'rtl'], ['ug', 'rtl'], ['yi', 'rtl'], ['dv', 'rtl'], ['ku', 'rtl'],
  ['ar-EG', 'rtl'], ['AR', 'rtl'], ['ku-TR', 'rtl'], ['ur-PK', 'rtl'],
  ['en', 'ltr'], ['ja', 'ltr'], ['tr', 'ltr'], ['hi', 'ltr'], ['el', 'ltr'], ['zh-Hans', 'ltr'],
];

export const LOCALE_DIR_CASES: LocaleDirRow[] = DIRECTIONS.map(([locale, dir]) => ({
  id: `i18n-dir-${locale.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${locale === 'AR' ? '-uppercased' : ''}-is-${dir}`,
  src: 'janux',
  locale,
  dir,
}));
