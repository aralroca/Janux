import type { Case } from '../support/case';

/**
 * Locale detection for unprefixed requests: `JANUX_LOCALE` cookie →
 * `accept-language` → `defaultLocale`.
 *
 * Quality values order preference per RFC 7231 §5.3.5 — the Brisa lineage
 * ignored them, which mis-served every client that lists its preference out
 * of order. Otherwise the rules are Brisa's: `*` is skipped rather than
 * matched, tags are lowercased before comparison while cookie values are
 * compared verbatim, and a bare language matches a regional locale in both
 * directions (`pt` → `pt-BR`, `en-GB` → `en`, and even `pt-PT` → `pt-BR` via
 * the shared base).
 */
export interface NegotiationCase {
  locales: string[];
  defaultLocale: string;
  /** `accept-language` header; omitted means the header is absent. */
  header?: string;
  /** `cookie` header; omitted means the header is absent. */
  cookie?: string;
  expected: string;
}

export type NegotiationRow = Case<NegotiationCase>;

export const NEGOTIATION_CASES: NegotiationRow[] = [
  // ── header matching ─────────────────────────────────────────────────────────
  { id: 'i18n-neg-no-headers-means-the-default', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', expected: 'en' },
  { id: 'i18n-neg-an-exact-tag-wins', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: 'es', expected: 'es' },
  { id: 'i18n-neg-a-quality-value-outranks-header-order', src: 'rfc7231:5.3.5#quality-values', locales: ['en', 'fr'], defaultLocale: 'en', header: 'fr;q=0.1,en;q=0.9', expected: 'en' },
  { id: 'i18n-neg-tags-are-lowercased-before-matching', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: 'ES', expected: 'es' },
  { id: 'i18n-neg-whitespace-around-tags-is-trimmed', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: '  es , en ', expected: 'es' },
  { id: 'i18n-neg-an-empty-header-means-the-default', src: 'janux', locales: ['en', 'es'], defaultLocale: 'es', header: '', expected: 'es' },
  { id: 'i18n-neg-a-malformed-header-means-the-default', src: 'janux', locales: ['en', 'es'], defaultLocale: 'es', header: ',,;;q=,', expected: 'es' },
  { id: 'i18n-neg-only-unsupported-tags-means-the-default', src: 'janux', locales: ['en', 'es'], defaultLocale: 'es', header: 'de,ja', expected: 'es' },
  { id: 'i18n-neg-unsupported-tags-are-skipped-in-order', src: 'janux', locales: ['es'], defaultLocale: 'en', header: 'de,fr,es', expected: 'es' },

  // ── wildcards ───────────────────────────────────────────────────────────────
  { id: 'i18n-neg-a-lone-wildcard-means-the-default', src: 'janux', locales: ['en', 'es'], defaultLocale: 'es', header: '*', expected: 'es' },
  { id: 'i18n-neg-a-wildcard-is-skipped-not-matched', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: '*,es', expected: 'es' },
  { id: 'i18n-neg-a-wildcard-with-a-q-value-is-still-skipped', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: '*;q=0.9,es;q=0.8', expected: 'es' },

  // ── base-language and regional matching ─────────────────────────────────────
  { id: 'i18n-neg-a-regional-tag-matches-its-base-locale', src: 'janux', locales: ['en', 'es'], defaultLocale: 'es', header: 'en-GB', expected: 'en' },
  { id: 'i18n-neg-a-base-tag-matches-a-regional-locale', src: 'brisa:get-locale-from-request#index', locales: ['en', 'pt-BR'], defaultLocale: 'en', header: 'pt', expected: 'pt-BR' },
  { id: 'i18n-neg-a-regional-tag-matches-across-regions', src: 'janux', locales: ['en', 'pt-BR'], defaultLocale: 'en', header: 'pt-PT', expected: 'pt-BR' },
  { id: 'i18n-neg-an-exact-base-locale-beats-the-regional-one', src: 'janux', locales: ['pt', 'pt-BR'], defaultLocale: 'pt-BR', header: 'pt', expected: 'pt' },
  { id: 'i18n-neg-a-cased-locale-matches-its-lowercased-tag', src: 'janux', locales: ['en', 'pt-BR'], defaultLocale: 'en', header: 'pt-br', expected: 'pt-BR' },
  { id: 'i18n-neg-a-three-digit-region-matches-the-base', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: 'es-419', expected: 'es' },

  // ── the JANUX_LOCALE cookie ─────────────────────────────────────────────────
  { id: 'i18n-neg-the-cookie-beats-the-header', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: 'en', cookie: 'JANUX_LOCALE=es', expected: 'es' },
  { id: 'i18n-neg-an-unsupported-cookie-falls-back-to-the-header', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', header: 'es', cookie: 'JANUX_LOCALE=de', expected: 'es' },
  { id: 'i18n-neg-a-regional-cookie-value-is-supported', src: 'janux', locales: ['en', 'pt-BR'], defaultLocale: 'en', cookie: 'JANUX_LOCALE=pt-BR', expected: 'pt-BR' },
  { id: 'i18n-neg-the-cookie-is-found-among-other-cookies', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', cookie: 'a=1; JANUX_LOCALE=es; b=2', expected: 'es' },
  { id: 'i18n-neg-a-prefixed-cookie-name-does-not-match', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', cookie: 'XJANUX_LOCALE=es', expected: 'en' },
  { id: 'i18n-neg-the-cookie-value-is-case-sensitive', src: 'janux', locales: ['en', 'es'], defaultLocale: 'en', cookie: 'JANUX_LOCALE=ES', expected: 'en' },
  { id: 'i18n-neg-the-first-of-duplicate-cookies-wins', src: 'janux', locales: ['en', 'es', 'fr'], defaultLocale: 'en', cookie: 'JANUX_LOCALE=es; JANUX_LOCALE=fr', expected: 'es' },
];
