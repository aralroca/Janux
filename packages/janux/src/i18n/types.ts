export interface I18nDictionary {
  [key: string]: string | I18nDictionary | I18nDictionary[];
}

export interface TranslationQuery {
  [name: string]: TranslationQuery | string | number;
}

export interface I18nConfig<T = I18nDictionary> {
  defaultLocale: string;
  locales: string[];
  messages?: Record<string, T>;
  interpolation?: {
    prefix?: string;
    suffix?: string;
    format?: (value: unknown, format: string, locale: string) => string;
  };
  allowEmptyStrings?: boolean;
  keySeparator?: string;
}

/**
 * Structurally a JanuxNode. Typed loosely on purpose: referencing JanuxNode here
 * would close the type cycle JanuxNode → ComponentDef → Ctx → I18n →
 * TranslateOptions and blow up instantiation of typed dictionaries (TS2589).
 */
export interface TranslationElement {
  $t: unknown;
  $p: Record<string, unknown>;
}

export interface TranslateOptions {
  returnObjects?: boolean;
  fallback?: string | string[];
  default?: unknown;
  elements?: TranslationElement[] | Record<string, TranslationElement>;
}

type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other' | `_${number}`;

type RemovePlural<Key extends string> = Key extends `${infer Prefix}${PluralSuffix}` ? Prefix : Key;

type Join<S1, S2, ReturnObjects extends boolean> = S1 extends string
  ? S2 extends string
    ? ReturnObjects extends true
      ? S1 | `${S1}.${S2}`
      : `${S1}.${S2}`
    : never
  : never;

/**
 * All translatable key paths of a messages object: nested keys joined with "."
 * and plural suffixes collapsed. Index-signature dictionaries (the untyped
 * default) resolve to plain `string`. RemovePlural applies at the leaf (a
 * concrete literal) — wrapping the recursive union instead trips TS2589.
 */
export type Paths<T, ReturnObjects extends boolean = true> = string extends Extract<keyof T, string>
  ? string
  : {
      [K in Extract<keyof T, string>]: T[K] extends Record<string, unknown>
        ? Join<K, Paths<T[K], ReturnObjects>, ReturnObjects>
        : RemovePlural<K>;
    }[Extract<keyof T, string>];

/**
 * Untyped dictionaries (the default) resolve to a plain-string signature here
 * instead of through `Paths` — framework code compares `Translate` values all
 * over, and relating generic signatures through the `Paths` conditional trips
 * TS2589. Typed dictionaries take the `Paths` branch at app call sites only.
 */
export type Translate<T = I18nDictionary> = I18nDictionary extends T
  ? <R = string>(i18nKey: string, query?: TranslationQuery | null, options?: TranslateOptions) => R
  : <R = string>(i18nKey: Paths<T>, query?: TranslationQuery | null, options?: TranslateOptions) => R;

/**
 * The i18n surface exposed on `ctx.i18n`. Parameterize with your default-locale
 * messages to get type-safe keys: `const { t } = ctx.i18n as I18n<typeof en>`.
 */
export interface I18n<T = I18nDictionary> {
  locale: string;
  defaultLocale: string;
  locales: string[];
  t: Translate<T>;
}
