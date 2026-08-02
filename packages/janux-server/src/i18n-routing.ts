import type { I18nConfig } from 'janux';

export const LOCALE_COOKIE = 'JANUX_LOCALE';

const LOCALE_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`);
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku']);

export interface LocalizedPath {
  locale?: string;
  pathname: string;
}

/** Splits "/es/shop" into locale "es" + "/shop" when the first segment is a supported locale. */
export function splitLocale(pathname: string, locales: string[]): LocalizedPath {
  const [, first = '', ...rest] = pathname.split('/');

  if (!locales.includes(first)) return { pathname };

  return { locale: first, pathname: `/${rest.join('/')}` };
}

function matchLocale(tag: string, locales: string[]): string | undefined {
  const base = tag.split('-')[0]!;

  return (
    locales.find((locale) => locale.toLowerCase() === tag) ??
    locales.find((locale) => locale.toLowerCase() === base || locale.toLowerCase().startsWith(`${base}-`))
  );
}

/**
 * Quality values order preference and `q=0` means "not acceptable"
 * (RFC 7231 §5.3.5) — header order only breaks ties, so `en;q=0.5,es`
 * prefers `es`. A missing or malformed `q` counts as 1; the sort is
 * stable, which is what keeps equal qualities in header order.
 */
function quality(params: string[]): number {
  const raw = params.map((param) => /^q=([0-9.]+)$/.exec(param.trim().toLowerCase())?.[1]).find(Boolean);
  const q = raw === undefined ? 1 : Number(raw);

  return Number.isNaN(q) ? 1 : q;
}

function acceptedTags(header: string | null): string[] {
  return (header ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';');

      return { tag: tag.trim().toLowerCase(), q: quality(params) };
    })
    .filter(({ tag, q }) => tag && tag !== '*' && q > 0)
    .sort((left, right) => right.q - left.q)
    .map(({ tag }) => tag);
}

/** Locale detection for unprefixed requests: JANUX_LOCALE cookie → accept-language → defaultLocale. */
export function detectLocale(req: Request, config: I18nConfig): string {
  const cookie = req.headers.get('cookie')?.match(LOCALE_COOKIE_PATTERN)?.[1];

  if (cookie && config.locales.includes(cookie)) return cookie;
  const match = acceptedTags(req.headers.get('accept-language'))
    .map((tag) => matchLocale(tag, config.locales))
    .find(Boolean);

  return match ?? config.defaultLocale;
}

/** Text direction for the `<html dir>` attribute. */
export function localeDir(locale: string): 'ltr' | 'rtl' {
  return RTL_LANGS.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr';
}
