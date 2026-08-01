import { jsx } from 'janux';
import type { Case } from '../support/case';

/**
 * Locale prefixing of internal `<a href>` values during SSR (Brisa-style).
 *
 * Only an anchor, only a string href, only a path — everything else must pass
 * through untouched, because the prefixer runs for every element of every
 * i18n page and a false positive silently reroutes navigation. The
 * language-switcher idiom (an href already carrying a *supported* locale) is
 * load-bearing: prefixing it again would trap users in their current locale.
 */
export interface LocalizedLinkCase {
  locale: string;
  locales: string[];
  node: () => unknown;
  expected: string;
}

export type LocalizedLinkRow = Case<LocalizedLinkCase>;

const a = (href: unknown) => jsx('a', { href, children: 'x' });

export const LOCALIZED_LINK_CASES: LocalizedLinkRow[] = [
  // ── internal paths get the current locale ───────────────────────────────────
  { id: 'i18nlink-internal-path-gets-the-locale-prefix', src: 'brisa:i18n-links#prefix', locale: 'en', locales: ['en', 'ca'], node: () => a('/docs'), expected: '<a href="/en/docs">x</a>' },
  { id: 'i18nlink-root-becomes-the-bare-locale', src: 'brisa:i18n-links#root', locale: 'en', locales: ['en', 'ca'], node: () => a('/'), expected: '<a href="/en">x</a>' },
  { id: 'i18nlink-nested-path-keeps-its-segments', src: 'janux', locale: 'ca', locales: ['en', 'ca'], node: () => a('/docs/intro?step=1'), expected: '<a href="/ca/docs/intro?step=1">x</a>' },
  { id: 'i18nlink-locale-lookalike-segment-is-still-prefixed', src: 'janux', locale: 'en', locales: ['en', 'ca'], node: () => a('/end'), expected: '<a href="/en/end">x</a>' },

  // ── already-prefixed hrefs are the language-switcher idiom ──────────────────
  { id: 'i18nlink-own-locale-prefix-is-not-doubled', src: 'brisa:i18n-links#already-prefixed', locale: 'en', locales: ['en', 'ca'], node: () => a('/en/docs'), expected: '<a href="/en/docs">x</a>' },
  { id: 'i18nlink-other-supported-locale-prefix-is-kept', src: 'brisa:i18n-links#switcher', locale: 'en', locales: ['en', 'ca'], node: () => a('/ca/docs'), expected: '<a href="/ca/docs">x</a>' },

  // ── framework and non-path urls pass through untouched ──────────────────────
  { id: 'i18nlink-janux-internal-urls-are-never-prefixed', src: 'janux', locale: 'en', locales: ['en'], node: () => a('/_janux/api/cart.add'), expected: '<a href="/_janux/api/cart.add">x</a>' },
  { id: 'i18nlink-absolute-url-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('https://example.com/docs'), expected: '<a href="https://example.com/docs">x</a>' },
  // A network-path reference targets another host; it must not become a path.
  { id: 'i18nlink-protocol-relative-url-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('//cdn.example.com/x'), expected: '<a href="//cdn.example.com/x">x</a>' },
  { id: 'i18nlink-hash-only-href-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('#top'), expected: '<a href="#top">x</a>' },
  { id: 'i18nlink-query-only-href-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('?page=2'), expected: '<a href="?page=2">x</a>' },
  { id: 'i18nlink-relative-href-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('docs/intro'), expected: '<a href="docs/intro">x</a>' },
  { id: 'i18nlink-mailto-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a('mailto:hi@example.com'), expected: '<a href="mailto:hi@example.com">x</a>' },
  { id: 'i18nlink-non-string-href-is-untouched', src: 'janux', locale: 'en', locales: ['en'], node: () => a(123), expected: '<a href="123">x</a>' },

  // ── only anchors are rewritten ──────────────────────────────────────────────
  { id: 'i18nlink-link-element-href-is-not-prefixed', src: 'janux', locale: 'en', locales: ['en'], node: () => jsx('link', { rel: 'stylesheet', href: '/app.css' }), expected: '<link rel="stylesheet" href="/app.css"/>' },
];
