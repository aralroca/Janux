import type { I18n, I18nDictionary } from './types';

/**
 * Typed accessor for `ctx.i18n`. Parameterize with your default-locale messages
 * to get compile-checked keys: `const { t } = getI18n<typeof en>(ctx)`.
 *
 * The parameter is structural (`{ i18n?: unknown }`, satisfied by any `Ctx`) on
 * purpose: comparing the argument against the full `I18n` shape while the
 * return type instantiates `I18n<T>` trips TS2589 on typed dictionaries.
 */
export function getI18n<T = I18nDictionary>(ctx: { i18n?: unknown }): I18n<T> {
  if (!ctx.i18n) throw new Error('janux: i18n is not configured — add src/i18n.ts with an I18nConfig default export.');

  return ctx.i18n as I18n<T>;
}
