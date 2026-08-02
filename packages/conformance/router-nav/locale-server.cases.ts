import type { Case } from '../support/case';

/**
 * Locale routing at the HTTP boundary, through `createJanuxServer`: every page
 * lives under its locale prefix and unprefixed requests are redirected (302) to
 * the detected locale (docs guide/i18n.md) — while `llms.txt` is never
 * localized. These rows pin the redirect *policy*; the detection order itself
 * is pinned per-function in `locale-routing.cases.ts`. Cases follow
 * `next:i18n#redirects`.
 *
 * The runner's server: locales `en`/`es`/`ar`, default `en`, pages `/` and
 * `/about`, llms.txt enabled.
 */
export interface LocaleServerCase {
  path: string;
  method?: 'POST';
  cookie?: string;
  accept?: string;
  status: number;
  location: string | null;
  /** Substring the HTML body must contain; only checked when given. */
  html?: string;
}

export type LocaleServerRow = Case<LocaleServerCase>;

export const LOCALE_SERVER_CASES: LocaleServerRow[] = [
  { id: 'locsrv-quality-values-shape-the-redirect', src: 'janux', path: '/', accept: 'en;q=0.5,es', status: 302, location: '/es' },
  { id: 'locsrv-cookie-shapes-a-deep-redirect', src: 'janux', path: '/about', cookie: 'JANUX_LOCALE=es', status: 302, location: '/es/about' },
  { id: 'locsrv-unknown-locale-prefix-redirects-as-a-plain-path', src: 'janux', path: '/fr', status: 302, location: '/en/fr' },
  { id: 'locsrv-unknown-prefix-deep-path-keeps-every-segment', src: 'janux', path: '/fr/about', status: 302, location: '/en/fr/about' },
  { id: 'locsrv-unknown-page-under-a-locale-is-a-404', src: 'janux', path: '/es/nope', status: 404, location: null },
  { id: 'locsrv-trailing-slash-survives-the-redirect', src: 'janux', path: '/about/', status: 302, location: '/en/about/' },
  { id: 'locsrv-encoded-segment-survives-the-redirect', src: 'janux', path: '/blog%20x', status: 302, location: '/en/blog%20x' },
  { id: 'locsrv-post-requests-redirect-like-gets', src: 'janux', path: '/about', method: 'POST', status: 302, location: '/en/about' },
  { id: 'locsrv-rtl-locale-serves-dir-rtl', src: 'janux', path: '/ar', status: 200, location: null, html: 'dir="rtl"' },
  { id: 'locsrv-llms-txt-is-never-localized', src: 'janux', path: '/llms.txt', status: 200, location: null },
];
