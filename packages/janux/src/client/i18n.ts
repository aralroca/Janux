import { translateCore } from '../i18n/translate-core';
import type { I18n, I18nDictionary } from '../i18n/types';
import type { BootFeature } from './features';

interface I18nPayload {
  locale: string;
  locales: string[];
  defaultLocale: string;
  messages: I18nDictionary;
  keySeparator?: string;
  allowEmptyStrings?: boolean;
  interpolation?: { prefix?: string; suffix?: string };
}

/**
 * Reads the page's embedded i18n payload (the messages its islands consume)
 * into `ctx.i18n`. Mutates ctx in place: mounted islands share the reference,
 * so after a locale-switch navigation their next render translates anew.
 */
export function installI18n(ctx: Record<string, unknown>): void {
  const script = document.querySelector('script[type="application/janux+i18n"]');

  if (!script) return;
  try {
    const payload = JSON.parse(script.textContent ?? '') as I18nPayload;
    const { locale, locales, defaultLocale } = payload;
    const config = {
      locales,
      defaultLocale,
      messages: { [locale]: payload.messages },
      keySeparator: payload.keySeparator,
      allowEmptyStrings: payload.allowEmptyStrings,
      interpolation: payload.interpolation,
    };

    ctx.i18n = { locale, locales, defaultLocale, t: translateCore(locale, config) } satisfies I18n;
  } catch {
    document.dispatchEvent(new CustomEvent('janux:error', { detail: 'invalid i18n payload' }));
  }
}

/**
 * Client-side translations as a boot feature: `boot({ i18n: i18n() })` reads
 * the page's embedded dictionary into the island context and re-reads it after
 * every SPA navigation (a locale switch ships a new payload). Importing it is
 * what ships it — apps without translations carry zero bytes of this module.
 */
export function i18n(): BootFeature {
  return {
    install: (ctx) => {
      installI18n(ctx);

      return () => installI18n(ctx);
    },
  };
}
