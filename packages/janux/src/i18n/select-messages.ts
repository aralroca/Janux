import type { I18nDictionary } from './types';

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other|\d+)$/;

type Entry = [path: string, value: string];

/** Dictionaries are static per locale, but this runs per page render: memoize the walk. */
const flatCache = new WeakMap<I18nDictionary, Map<string, Entry[]>>();

function flatten(dic: I18nDictionary, separator: string, prefix = ''): Entry[] {
  return Object.entries(dic).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}${separator}${key}` : key;

    return typeof value === 'string' ? [[path, value] as Entry] : flatten(value as I18nDictionary, separator, path);
  });
}

function flattened(dic: I18nDictionary, separator: string): Entry[] {
  const perSeparator = flatCache.get(dic) ?? new Map<string, Entry[]>();
  const entries = perSeparator.get(separator) ?? flatten(dic, separator);

  perSeparator.set(separator, entries);
  flatCache.set(dic, perSeparator);

  return entries;
}

function matches(path: string, keys: string[], patterns: (string | RegExp)[], separator: string): boolean {
  const base = path.replace(PLURAL_SUFFIX, '');

  if (keys.includes(path) || keys.includes(base)) return true;
  if (keys.some((key) => path.startsWith(`${key}${separator}`))) return true;

  return patterns.some((pattern) => (typeof pattern === 'string' ? path.startsWith(pattern) : pattern.test(path)));
}

function assign(target: I18nDictionary, path: string[], value: string): void {
  const [head, ...rest] = path;

  if (rest.length === 0) {
    target[head!] = value;

    return;
  }
  target[head!] ??= {};
  assign(target[head!] as I18nDictionary, rest, value);
}

/**
 * Filters a locale's messages down to what a page's islands consume: the keys
 * recorded during SSR (plus their plural variants and nested subtrees) and the
 * islands' declared `i18nKeys` (string prefix or RegExp).
 */
export function selectMessages(
  dic: I18nDictionary,
  used: Iterable<string>,
  declared: (string | RegExp)[] = [],
  separator = '.',
): I18nDictionary {
  const keys = [...new Set(used)];
  const subset: I18nDictionary = {};

  flattened(dic, separator)
    .filter(([path]) => matches(path, keys, declared, separator))
    .forEach(([path, value]) => assign(subset, path.split(separator), value));

  return subset;
}
