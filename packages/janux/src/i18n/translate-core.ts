import type { I18nConfig, Translate, TranslateOptions, TranslationQuery } from './types';
import { formatElements } from './format-elements';

type Query = TranslationQuery | null | undefined;
type Dictionary = Record<string, unknown>;

function escapeRegex(text: string): string {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** Placeholder name: the realistic key shapes, and never a regex the caller supplied. */
const NAME = '([\\w$.-]+)';

/**
 * Replaces `{{variable}}` and `{{variable, format}}` occurrences with query values.
 *
 * One pass over the template, driven by the placeholders rather than by the query
 * keys. Looping over the keys and replacing each in turn had two defects: a
 * substituted value was re-scanned by every later key, so
 * `{ a: '{{b}}', b: secret }` resolved `{{a}}` to the secret; and the key was
 * interpolated into a `RegExp`, so `{ '.*': x }` replaced every placeholder in the
 * string and `{ '(a+)+$': x }` spent 739ms backtracking on a single call.
 */
function interpolation(text: string | undefined, query: Query, config: I18nConfig, locale: string): string {
  const { format = null, prefix = '{{', suffix = '}}' } = config.interpolation ?? {};

  if (!text || !query) return text ?? '';
  const suffixPattern = suffix === '' ? '' : `(?:[\\s,]+([\\w-]*))?\\s*${escapeRegex(suffix)}`;
  const pattern = new RegExp(`${escapeRegex(prefix)}\\s*${NAME}${suffixPattern}`, 'gm');

  return text.replace(pattern, (match: string, varKey: string, formatName?: string) => {
    // `hasOwn`, not `in`: otherwise `{{toString}}` would resolve off the prototype.
    if (!Object.hasOwn(query, varKey)) return match;

    return formatName && format ? format(query[varKey], formatName, locale) : String(query[varKey]);
  });
}

/** Dispatches by shape; anything not a string or container is returned untouched. */
function interpolateValue(value: unknown, query: Query, config: I18nConfig, locale: string): unknown {
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, query, config, locale));
  if (typeof value === 'string') return interpolation(value, query, config, locale);
  if (value instanceof Object) return objectInterpolation(value as Dictionary, query, config, locale);

  return value;
}

/**
 * Returns a new object rather than interpolating in place.
 *
 * Dictionary values arrive deep-cloned, but `options.default` does not — and a
 * default is typically a module constant, so mutating it baked the first caller's
 * values into every later request on the server.
 */
function objectInterpolation(obj: Dictionary, query: Query, config: I18nConfig, locale: string): Dictionary {
  if (!query || Object.keys(query).length === 0) return obj;

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, interpolateValue(value, query, config, locale)]),
  );
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

  const interpolateUnknown = (value: unknown, query: Query): unknown =>
    interpolateValue(value, query, config, locale);

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
