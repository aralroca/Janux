import type { Case } from '../support/case';

/**
 * Key resolution knobs and plural-variant precedence beyond the base
 * `translate.cases.ts` table: `keySeparator`, `allowEmptyStrings`, the
 * `_zero`/exact-count/category ladder per locale, and what a non-string leaf
 * or a falsy `default` resolves to.
 *
 * The plural rows pin the variant order the Brisa lineage promises:
 * `key_<count>` (exact) → `key_<category>` → `key.<count>` → `key.<category>`
 * — and that `_zero` is a CLDR category, not an i18next-style 0-override:
 * English count 0 selects `other`, never `_zero`; Arabic and Latvian reach
 * `_zero` because their rule set really has the category.
 */
export interface ResolutionCase {
  messages: Record<string, unknown>;
  key: string;
  query?: Record<string, unknown> | null;
  options?: Record<string, unknown>;
  /** Dictionary locale and translation locale, `en` when omitted. */
  locale?: string;
  keySeparator?: string;
  allowEmptyStrings?: boolean;
  expected: unknown;
}

export type ResolutionRow = Case<ResolutionCase>;

export const RESOLUTION_CASES: ResolutionRow[] = [
  // ── keySeparator ────────────────────────────────────────────────────────────
  { id: 'i18n-res-a-literal-dot-key-is-invisible-under-the-default-separator', src: 'janux', messages: { 'a.b': 'flat' }, key: 'a.b', expected: 'a.b' },
  { id: 'i18n-res-empty-separator-resolves-flat-keys', src: 'janux', messages: { 'a.b': 'flat' }, key: 'a.b', keySeparator: '', expected: 'flat' },
  { id: 'i18n-res-empty-separator-disables-nesting', src: 'janux', messages: { a: { b: 'x' } }, key: 'a.b', keySeparator: '', expected: 'a.b' },
  { id: 'i18n-res-a-multi-character-separator', src: 'janux', messages: { a: { b: 'x' } }, key: 'a::b', keySeparator: '::', expected: 'x' },
  { id: 'i18n-res-the-separator-key-returns-the-whole-dictionary', src: 'brisa:translate-core#index.test', messages: { a: { b: 'x' } }, key: '.', options: { returnObjects: true }, expected: { a: { b: 'x' } } },
  { id: 'i18n-res-the-separator-key-without-returnobjects-echoes', src: 'janux', messages: { a: { b: 'x' } }, key: '.', expected: '.' },
  { id: 'i18n-res-a-trailing-separator-misses', src: 'janux', messages: { a: { b: 'x' } }, key: 'a.', expected: 'a.' },

  // ── allowEmptyStrings ───────────────────────────────────────────────────────
  { id: 'i18n-res-empty-message-beats-a-fallback-by-default', src: 'janux', messages: { empty: '', hello: 'Hi' }, key: 'empty', options: { fallback: 'hello' }, expected: '' },
  { id: 'i18n-res-disallowed-empty-message-uses-the-fallback', src: 'janux', messages: { empty: '', hello: 'Hi' }, key: 'empty', allowEmptyStrings: false, options: { fallback: 'hello' }, expected: 'Hi' },
  { id: 'i18n-res-disallowed-empty-message-uses-the-default', src: 'janux', messages: { empty: '' }, key: 'empty', allowEmptyStrings: false, options: { default: 'D' }, expected: 'D' },

  // ── non-string leaves ───────────────────────────────────────────────────────
  { id: 'i18n-res-a-numeric-leaf-is-not-a-message', src: 'janux', messages: { k: 5 }, key: 'k', expected: 'k' },
  { id: 'i18n-res-a-boolean-leaf-is-not-a-message', src: 'janux', messages: { k: true }, key: 'k', expected: 'k' },
  { id: 'i18n-res-an-empty-object-is-a-miss-even-with-returnobjects', src: 'janux', messages: { group: {} }, key: 'group', options: { returnObjects: true }, expected: 'group' },
  { id: 'i18n-res-arrays-of-objects-interpolate-deeply', src: 'janux', messages: { list: [{ t: 'a {{n}}' }] }, key: 'list', query: { n: 1 }, options: { returnObjects: true }, expected: [{ t: 'a 1' }] },
  { id: 'i18n-res-an-object-query-value-stringifies', src: 'janux', messages: { k: '{{o}}' }, key: 'k', query: { o: { a: 1 } }, expected: '[object Object]' },

  // ── fallbacks and defaults ──────────────────────────────────────────────────
  { id: 'i18n-res-an-empty-fallback-list-echoes-the-key', src: 'janux', messages: {}, key: 'nope', options: { fallback: [] }, expected: 'nope' },
  { id: 'i18n-res-a-missed-fallback-still-reaches-the-default', src: 'janux', messages: {}, key: 'nope', options: { fallback: 'also-nope', default: 'D' }, expected: 'D' },
  { id: 'i18n-res-a-fallback-may-be-a-nested-key', src: 'janux', messages: { a: { b: 'deep' } }, key: 'nope', options: { fallback: 'a.b' }, expected: 'deep' },
  { id: 'i18n-res-a-fallback-key-resolves-plurals-too', src: 'janux', messages: { b_one: 'one B' }, key: 'a', query: { count: 1 }, options: { fallback: 'b' }, expected: 'one B' },
  // A falsy default is returned as-is — `default: 0` must not fall through to the key.
  { id: 'i18n-res-default-zero-is-honoured', src: 'janux', messages: {}, key: 'missing', query: { n: 1 }, options: { default: 0 }, expected: 0 },
  { id: 'i18n-res-default-false-is-honoured', src: 'janux', messages: {}, key: 'missing', options: { default: false }, expected: false },
  { id: 'i18n-res-default-null-is-honoured', src: 'janux', messages: {}, key: 'missing', options: { default: null }, expected: null },
  { id: 'i18n-res-an-object-default-is-interpolated', src: 'janux', messages: {}, key: 'missing', query: { n: 1 }, options: { default: { m: 'hi {{n}}' } }, expected: { m: 'hi 1' } },
  { id: 'i18n-res-an-array-default-is-interpolated', src: 'janux', messages: {}, key: 'missing', query: { n: 1 }, options: { default: ['a {{n}}'] }, expected: ['a 1'] },

  // ── plural variant precedence ───────────────────────────────────────────────
  { id: 'i18n-res-underscore-category-beats-the-dotted-form', src: 'janux', messages: { items_one: 'u', items: { one: 'd' } }, key: 'items', query: { count: 1 }, expected: 'u' },
  { id: 'i18n-res-an-exact-count-beats-the-category-in-ar', src: 'janux', messages: { items_2: 'exact', items_two: 'cat', items_other: 'o' }, key: 'items', query: { count: 2 }, locale: 'ar', expected: 'exact' },
  { id: 'i18n-res-dotted-categories-under-a-nested-key', src: 'brisa:translate-core#index.test', messages: { items: { one: 'd one', other: 'd {{count}}' } }, key: 'items', query: { count: 4 }, expected: 'd 4' },
  { id: 'i18n-res-plural-variants-of-a-nested-key', src: 'janux', messages: { a: { b_one: 'nested one' } }, key: 'a.b', query: { count: 1 }, expected: 'nested one' },
  { id: 'i18n-res-negative-zero-matches-the-exact-zero-variant', src: 'janux', messages: { items_0: 'none', items_other: 'o' }, key: 'items', query: { count: -0 }, expected: 'none' },
  { id: 'i18n-res-an-infinite-count-selects-other', src: 'janux', messages: { items_other: '{{count}} items' }, key: 'items', query: { count: Infinity }, expected: 'Infinity items' },
  { id: 'i18n-res-a-string-count-skips-plurals-but-still-interpolates', src: 'janux', messages: { items: 'n={{count}}' }, key: 'items', query: { count: 'x' }, expected: 'n=x' },

  // ── _zero is a CLDR category, not a 0-override ──────────────────────────────
  { id: 'i18n-res-zero-suffix-is-ignored-in-english', src: 'janux', messages: { items_zero: 'Z', items_other: 'O' }, key: 'items', query: { count: 0 }, expected: 'O' },
  { id: 'i18n-res-zero-suffix-is-selected-in-arabic', src: 'janux', messages: { items_zero: 'Z', items_other: 'O' }, key: 'items', query: { count: 0 }, locale: 'ar', expected: 'Z' },
  { id: 'i18n-res-exact-0-beats-the-zero-category-in-arabic', src: 'janux', messages: { items_0: 'exact', items_zero: 'Z' }, key: 'items', query: { count: 0 }, locale: 'ar', expected: 'exact' },
  { id: 'i18n-res-latvian-teens-reach-the-zero-suffix', src: 'cldr:plural-rules#lv', messages: { items_zero: 'Z {{count}}', items_one: 'one' }, key: 'items', query: { count: 10 }, locale: 'lv', expected: 'Z 10' },
  { id: 'i18n-res-french-zero-selects-the-one-message', src: 'cldr:plural-rules#fr', messages: { items_one: 'un', items_other: 'des' }, key: 'items', query: { count: 0 }, locale: 'fr', expected: 'un' },
];
