import type { Case } from '../support/case';

/**
 * Key resolution, interpolation, fallbacks and defaults.
 *
 * `translateCore` is next-translate's `transCore` lineage, so the cases follow the
 * bugs that family accumulated: which plural variant wins, what happens to a
 * placeholder nobody supplied, nested key traversal that walks into a string, and
 * the query keys that used to be compiled straight into a regular expression.
 */
export interface TranslateCase {
  messages: Record<string, unknown>;
  key: string;
  query?: Record<string, unknown> | null;
  options?: Record<string, unknown>;
  locale?: string;
  expected: unknown;
}

export type TranslateRow = Case<TranslateCase>;

const FLAT = { hello: 'Hello', greet: 'Hello {{name}}!', empty: '' };
const NESTED = { a: { b: { c: 'deep' } }, list: ['x {{n}}', 'y'] };
/** `dot` is nested, because the `key.<variant>` form resolves through the key tree. */
const PLURALS = { items_one: 'one item', items_other: '{{count}} items', items_0: 'none', dot: { 2: 'two via dot' } };

export const TRANSLATE_CASES: TranslateRow[] = [
  // ── plain lookup ────────────────────────────────────────────────────────────
  { id: 'tr-returns-the-message', src: 'janux', messages: FLAT, key: 'hello', expected: 'Hello' },
  { id: 'tr-returns-the-key-when-missing', src: 'janux', messages: FLAT, key: 'nope', expected: 'nope' },
  { id: 'tr-returns-an-empty-message-by-default', src: 'janux', messages: FLAT, key: 'empty', expected: '' },
  { id: 'tr-an-empty-key-returns-itself', src: 'janux', messages: FLAT, key: '', expected: '' },
  { id: 'tr-lookup-is-case-sensitive', src: 'janux', messages: FLAT, key: 'Hello', expected: 'Hello' },
  { id: 'tr-a-missing-locale-falls-back-to-the-key', src: 'janux', messages: FLAT, key: 'hello', locale: 'zz', expected: 'hello' },

  // ── nested keys ─────────────────────────────────────────────────────────────
  { id: 'tr-resolves-a-nested-key', src: 'janux', messages: NESTED, key: 'a.b.c', expected: 'deep' },
  { id: 'tr-a-partial-nested-key-returns-itself', src: 'janux', messages: NESTED, key: 'a.b', expected: 'a.b' },
  { id: 'tr-walking-past-a-string-returns-the-key', src: 'janux', messages: NESTED, key: 'a.b.c.d', expected: 'a.b.c.d' },
  { id: 'tr-a-nested-key-with-a-missing-branch-returns-itself', src: 'janux', messages: NESTED, key: 'a.zz.c', expected: 'a.zz.c' },
  { id: 'tr-returns-an-object-when-asked', src: 'janux', messages: NESTED, key: 'a.b', options: { returnObjects: true }, expected: { c: 'deep' } },
  { id: 'tr-returns-an-array-when-asked', src: 'janux', messages: NESTED, key: 'list', options: { returnObjects: true }, expected: ['x {{n}}', 'y'] },
  { id: 'tr-interpolates-inside-a-returned-array', src: 'janux', messages: NESTED, key: 'list', query: { n: 1 }, options: { returnObjects: true }, expected: ['x 1', 'y'] },

  // ── interpolation ───────────────────────────────────────────────────────────
  { id: 'tr-interpolates-a-variable', src: 'janux', messages: FLAT, key: 'greet', query: { name: 'Ada' }, expected: 'Hello Ada!' },
  { id: 'tr-leaves-a-placeholder-nobody-supplied', src: 'janux', messages: FLAT, key: 'greet', query: { other: 'x' }, expected: 'Hello {{name}}!' },
  { id: 'tr-leaves-every-placeholder-when-there-is-no-query', src: 'janux', messages: FLAT, key: 'greet', expected: 'Hello {{name}}!' },
  { id: 'tr-a-null-query-leaves-placeholders', src: 'janux', messages: FLAT, key: 'greet', query: null, expected: 'Hello {{name}}!' },
  { id: 'tr-replaces-every-occurrence', src: 'janux', messages: { k: '{{n}}-{{n}}-{{n}}' }, key: 'k', query: { n: 7 }, expected: '7-7-7' },
  { id: 'tr-tolerates-whitespace-inside-the-braces', src: 'janux', messages: { k: '{{  n  }}' }, key: 'k', query: { n: 1 }, expected: '1' },
  { id: 'tr-interpolates-a-number', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: 0 }, expected: '0' },
  { id: 'tr-interpolates-false', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: false }, expected: 'false' },
  { id: 'tr-interpolates-null-as-text', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: null }, expected: 'null' },
  { id: 'tr-interpolates-undefined-as-text', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: undefined }, expected: 'undefined' },
  { id: 'tr-interpolates-an-array-as-text', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: [1, 2] }, expected: '1,2' },
  { id: 'tr-does-not-interpolate-across-a-newline-boundary', src: 'janux', messages: { k: '{{n}}\n{{n}}' }, key: 'k', query: { n: 'x' }, expected: 'x\nx' },
  { id: 'tr-a-value-containing-a-placeholder-is-not-re-interpolated', src: 'janux', messages: { k: '{{a}}' }, key: 'k', query: { a: '{{b}}', b: 'no' }, expected: '{{b}}' },
  { id: 'tr-interpolates-inside-a-nested-object', src: 'janux', messages: { o: { deep: 'v={{n}}' } }, key: 'o', query: { n: 2 }, options: { returnObjects: true }, expected: { deep: 'v=2' } },
  { id: 'tr-interpolation-does-not-touch-a-non-string-leaf', src: 'janux', messages: { o: { n: 5 } }, key: 'o', query: { x: 1 }, options: { returnObjects: true }, expected: { n: 5 } },

  // ── a query key is data, never a pattern ────────────────────────────────────
  { id: 'tr-a-wildcard-query-key-matches-nothing', src: 'janux', messages: FLAT, key: 'greet', query: { '.*': 'PWNED' }, expected: 'Hello {{name}}!' },
  { id: 'tr-a-group-query-key-matches-nothing', src: 'janux', messages: { k: 'x {{n}} y' }, key: 'k', query: { 'n(a|b)': 'Z' }, expected: 'x {{n}} y' },
  { id: 'tr-a-nested-quantifier-query-key-is-inert', src: 'janux', messages: { k: '{{aaaaaaaaaaaaaaaaaaaa}}' }, key: 'k', query: { '(a+)+$': 'x' }, expected: '{{aaaaaaaaaaaaaaaaaaaa}}' },
  { id: 'tr-an-anchor-query-key-is-inert', src: 'janux', messages: { k: '^{{n}}$' }, key: 'k', query: { '^': 'x' }, expected: '^{{n}}$' },
  { id: 'tr-a-backslash-query-key-is-inert', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { '\\d': 'x' }, expected: '{{n}}' },
  { id: 'tr-a-literal-dollar-in-a-value-is-not-a-replacement-token', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: "$'" }, expected: "$'" },
  { id: 'tr-a-dollar-ampersand-value-is-inserted-literally', src: 'janux', messages: { k: '{{n}}' }, key: 'k', query: { n: '$&' }, expected: '$&' },
  { id: 'tr-a-prototype-name-does-not-resolve-off-the-prototype', src: 'janux', messages: { k: '{{toString}}' }, key: 'k', query: { x: 1 }, expected: '{{toString}}' },
  { id: 'tr-a-proto-placeholder-is-left-intact', src: 'janux', messages: { k: '{{__proto__}}' }, key: 'k', query: { x: 1 }, expected: '{{__proto__}}' },
  { id: 'tr-a-constructor-placeholder-is-left-intact', src: 'janux', messages: { k: '{{constructor}}' }, key: 'k', query: { x: 1 }, expected: '{{constructor}}' },
  { id: 'tr-an-own-key-named-tostring-is-honoured', src: 'janux', messages: { k: '{{toString}}' }, key: 'k', query: { toString: 'mine' }, expected: 'mine' },
  { id: 'tr-two-values-are-substituted-independently', src: 'janux', messages: { k: '{{a}}|{{b}}' }, key: 'k', query: { a: '{{b}}', b: 'B' }, expected: '{{b}}|B' },

  // ── plural variant precedence ───────────────────────────────────────────────
  { id: 'tr-plural-picks-the-category-message', src: 'janux', messages: PLURALS, key: 'items', query: { count: 1 }, expected: 'one item' },
  { id: 'tr-plural-interpolates-the-count', src: 'janux', messages: PLURALS, key: 'items', query: { count: 5 }, expected: '5 items' },
  { id: 'tr-an-exact-count-key-beats-the-category', src: 'janux', messages: PLURALS, key: 'items', query: { count: 0 }, expected: 'none' },
  { id: 'tr-a-dotted-exact-count-key-is-also-found', src: 'janux', messages: PLURALS, key: 'dot', query: { count: 2 }, expected: 'two via dot' },
  { id: 'tr-no-plural-resolution-without-a-count', src: 'janux', messages: PLURALS, key: 'items', expected: 'items' },
  { id: 'tr-a-non-numeric-count-skips-plural-resolution', src: 'janux', messages: PLURALS, key: 'items', query: { count: '1' }, expected: 'items' },
  { id: 'tr-a-negative-count-uses-its-category', src: 'janux', messages: PLURALS, key: 'items', query: { count: -1 }, expected: 'one item' },
  { id: 'tr-a-fractional-count-uses-the-other-category', src: 'janux', messages: PLURALS, key: 'items', query: { count: 1.5 }, expected: '1.5 items' },
  { id: 'tr-a-missing-category-message-returns-the-bare-key', src: 'janux', messages: { items_one: 'one' }, key: 'items', query: { count: 5 }, expected: 'items' },

  // ── fallbacks and defaults ──────────────────────────────────────────────────
  { id: 'tr-falls-back-to-a-second-key', src: 'janux', messages: FLAT, key: 'nope', options: { fallback: 'hello' }, expected: 'Hello' },
  { id: 'tr-walks-a-fallback-chain', src: 'janux', messages: FLAT, key: 'nope', options: { fallback: ['also-nope', 'hello'] }, expected: 'Hello' },
  { id: 'tr-returns-the-key-when-every-fallback-misses', src: 'janux', messages: FLAT, key: 'nope', options: { fallback: ['a', 'b'] }, expected: 'b' },
  { id: 'tr-uses-the-default-when-missing', src: 'janux', messages: FLAT, key: 'nope', options: { default: 'fallback text' }, expected: 'fallback text' },
  { id: 'tr-interpolates-the-default', src: 'janux', messages: FLAT, key: 'nope', query: { name: 'Ada' }, options: { default: 'Hi {{name}}' }, expected: 'Hi Ada' },
  { id: 'tr-an-empty-string-default-is-honoured', src: 'janux', messages: FLAT, key: 'nope', options: { default: '' }, expected: '' },
  { id: 'tr-a-present-message-ignores-the-default', src: 'janux', messages: FLAT, key: 'hello', options: { default: 'unused' }, expected: 'Hello' },
  { id: 'tr-a-fallback-is-preferred-over-the-default', src: 'janux', messages: FLAT, key: 'nope', options: { fallback: 'hello', default: 'unused' }, expected: 'Hello' },
];
