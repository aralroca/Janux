import type { I18nConfig, Translate, TranslateOptions, TranslationQuery } from './types';
import { formatElements } from './format-elements';

type Query = TranslationQuery | null | undefined;
type Dictionary = Record<string, unknown>;

function escapeRegex(text: string): string {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** Replaces `{{variable}}` and `{{variable, format}}` occurrences with query values. */
function interpolation(text: string | undefined, query: Query, config: I18nConfig, locale: string): string {
  const { format = null, prefix = '{{', suffix = '}}' } = config.interpolation ?? {};
  const suffixPattern = suffix === '' ? '' : `(?:[\\s,]+([\\w-]*))?\\s*${escapeRegex(suffix)}`;

  if (!text || !query) return text ?? '';

  return Object.keys(query).reduce((all, varKey) => {
    const regex = new RegExp(`${escapeRegex(prefix)}\\s*${varKey}${suffixPattern}`, 'gm');

    return all.replace(regex, (_match, formatName) =>
      formatName && format ? format(query[varKey], formatName, locale) : String(query[varKey]),
    );
  }, text);
}

function objectInterpolation(obj: Dictionary, query: Query, config: I18nConfig, locale: string): Dictionary {
  if (!query || Object.keys(query).length === 0) return obj;

  Object.keys(obj).forEach((key) => {
    if (obj[key] instanceof Object) objectInterpolation(obj[key] as Dictionary, query, config, locale);
    if (typeof obj[key] === 'string') obj[key] = interpolation(obj[key] as string, query, config, locale);
  });

  return obj;
}

/** Gets a value from the dictionary, resolving nested keys ("parent.child") via keySeparator. */
function getDicValue(dic: Dictionary, key: string, config: I18nConfig, options?: TranslateOptions): unknown {
  const { keySeparator = '.' } = config;
  const keyParts = keySeparator ? key.split(keySeparator) : [key];

  if (key === keySeparator && options?.returnObjects) return dic;

  const value = keyParts.reduce<unknown>((val, part) => {
    if (typeof val === 'string') return {};
    const nested = (val as Dictionary)[part];

    return nested || (typeof nested === 'string' ? nested : {});
  }, dic);

  if (typeof value === 'string') return value;
  if (value instanceof Object && options?.returnObjects) return value;

  return undefined;
}

/** Resolves the plural variant of a key from `query.count`: `key_3`, `key_one`, `key.3`, `key.other`. */
function plural(pluralRules: Intl.PluralRules, dic: Dictionary, key: string, config: I18nConfig, query: Query): string {
  if (!query || typeof query.count !== 'number') return key;

  const variants = [
    `${key}_${query.count}`,
    `${key}_${pluralRules.select(query.count)}`,
    `${key}.${query.count}`,
    `${key}.${pluralRules.select(query.count)}`,
  ];

  return variants.find((variant) => getDicValue(dic, variant, config) !== undefined) ?? key;
}

function isEmpty(value: unknown, allowEmptyStrings: boolean): boolean {
  if (value === undefined) return true;
  if (typeof value === 'object' && value !== null && !Object.keys(value).length) return true;

  return value === '' && !allowEmptyStrings;
}

/** next-translate's transCore, ported from Brisa (same author): plurals, interpolation, nested keys, fallbacks. */
export function translateCore(locale: string, config: I18nConfig): Translate {
  const { allowEmptyStrings = true } = config;
  const pluralRules = new Intl.PluralRules(locale);

  const interpolateUnknown = (value: unknown, query: Query): unknown => {
    if (Array.isArray(value)) return value.map((item) => interpolateUnknown(item, query));
    if (value instanceof Object) return objectInterpolation(value as Dictionary, query, config, locale);

    return interpolation(value as string, query, config, locale);
  };

  const translate = (key: string, query: Query, options?: TranslateOptions): unknown => {
    const dic = (config.messages?.[locale] ?? {}) as Dictionary;
    const dicValue = getDicValue(dic, plural(pluralRules, dic, key, config, query), config, options);
    const value = typeof dicValue === 'object' ? JSON.parse(JSON.stringify(dicValue)) : dicValue;
    const fallbacks = typeof options?.fallback === 'string' ? [options.fallback] : (options?.fallback ?? []);

    if (!isEmpty(value, allowEmptyStrings)) return interpolateUnknown(value, query);
    if (fallbacks.length > 0) return translate(fallbacks[0]!, query, { ...options, fallback: fallbacks.slice(1) });
    if (options && 'default' in options) return options.default ? interpolateUnknown(options.default, query) : options.default;

    return key;
  };

  return ((key = '', query?, options?) => {
    const text = translate(key as string, query, options);

    return options?.elements ? formatElements(text as string, options.elements) : text;
  }) as Translate;
}
