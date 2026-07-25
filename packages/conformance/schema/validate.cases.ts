import { bool, enums, int, list, money, num, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * Schema validation, one row per distinct verdict.
 *
 * Validation is where a framework meets input it did not write — agent tool
 * arguments, RPC bodies, resumed snapshots — so the interesting rows are the ones
 * that look valid and are not: numeric strings, `NaN`, `-0`, array holes,
 * prototype keys, and values that sit exactly on a bound. Shape follows
 * `vue:componentProps` and `angular:forms/validators`.
 */
export interface ValidateCase {
  /** Built lazily: some rows assert that building the schema itself throws. */
  type: () => JxType;
  input: unknown;
  ok: boolean;
  /** Expected output when `ok`; omitted means "same as input". */
  value?: unknown;
  /** Substring the first error message must contain, when not `ok`. */
  message?: string;
  /** Exact `path` of the first error, when the location is the point of the case. */
  path?: string;
}

export type ValidateRow = Case<ValidateCase>;

const S = () => str();
const I = () => int();
const N = () => num();
const B = () => bool();
const M = () => money();

export const VALIDATE_CASES: ValidateRow[] = [
  // ── string ──────────────────────────────────────────────────────────────────
  { id: 'val-str-accepts-a-string', src: 'vue:componentProps#type-String', type: S, input: 'x', ok: true },
  { id: 'val-str-accepts-empty', src: 'janux', type: S, input: '', ok: true },
  { id: 'val-str-accepts-whitespace-only', src: 'janux', type: S, input: '   ', ok: true },
  { id: 'val-str-accepts-a-multiline-string', src: 'janux', type: S, input: 'a\nb', ok: true },
  { id: 'val-str-accepts-emoji', src: 'janux', type: S, input: '🎉', ok: true },
  { id: 'val-str-accepts-a-lone-surrogate', src: 'janux', type: S, input: '\ud800', ok: true },
  { id: 'val-str-rejects-a-number', src: 'vue:componentProps#wrong-type', type: S, input: 1, ok: false, message: 'expected string' },
  { id: 'val-str-rejects-a-numeric-string-lookalike-is-fine', src: 'janux', type: S, input: '1', ok: true },
  { id: 'val-str-rejects-a-boolean', src: 'janux', type: S, input: true, ok: false, message: 'expected string' },
  { id: 'val-str-rejects-an-array', src: 'janux', type: S, input: [], ok: false, message: 'expected string' },
  { id: 'val-str-rejects-an-object', src: 'janux', type: S, input: {}, ok: false, message: 'expected string' },
  { id: 'val-str-rejects-a-boxed-string', src: 'angular:validators#boxed-primitive', type: S, input: new String('x'), ok: false, message: 'expected string' },

  // ── string bounds count UTF-16 code units ───────────────────────────────────
  { id: 'val-str-min-accepts-exactly-the-bound', src: 'angular:validators#minLength-boundary', type: () => str().min(3), input: 'abc', ok: true },
  { id: 'val-str-min-rejects-one-below', src: 'angular:validators#minLength', type: () => str().min(3), input: 'ab', ok: false, message: 'below min 3' },
  { id: 'val-str-max-accepts-exactly-the-bound', src: 'angular:validators#maxLength-boundary', type: () => str().max(3), input: 'abc', ok: true },
  { id: 'val-str-max-rejects-one-above', src: 'angular:validators#maxLength', type: () => str().max(3), input: 'abcd', ok: false, message: 'above max 3' },
  { id: 'val-str-min-one-rejects-empty', src: 'janux', type: () => str().min(1), input: '', ok: false, message: 'below min 1' },
  { id: 'val-str-min-zero-accepts-empty', src: 'janux', type: () => str().min(0), input: '', ok: true },
  { id: 'val-str-bounds-count-code-units-not-graphemes', src: 'janux', type: () => str().max(1), input: '🎉', ok: false, message: 'above max 1' },
  { id: 'val-str-a-two-unit-emoji-passes-a-max-of-two', src: 'janux', type: () => str().max(2), input: '🎉', ok: true },
  // Decomposed: `e` + combining acute is two code units but one grapheme.
  { id: 'val-str-a-combining-sequence-counts-every-unit', src: 'janux', type: () => str().max(1), input: 'é', ok: false, message: 'above max 1' },
  { id: 'val-str-the-precomposed-form-of-the-same-grapheme-is-one-unit', src: 'janux', type: () => str().max(1), input: 'é', ok: true },
  { id: 'val-str-both-bounds-form-a-window', src: 'janux', type: () => str().min(2).max(4), input: 'abc', ok: true },
  { id: 'val-str-impossible-window-always-fails', src: 'janux', type: () => str().min(5).max(2), input: 'abc', ok: false, message: 'below min 5' },

  // ── int ─────────────────────────────────────────────────────────────────────
  { id: 'val-int-accepts-a-positive-integer', src: 'vue:componentProps#type-Number', type: I, input: 1, ok: true },
  { id: 'val-int-accepts-zero', src: 'janux', type: I, input: 0, ok: true },
  { id: 'val-int-accepts-a-negative-integer', src: 'janux', type: I, input: -5, ok: true },
  { id: 'val-int-accepts-negative-zero', src: 'janux', type: I, input: -0, ok: true },
  { id: 'val-int-accepts-a-large-safe-integer', src: 'janux', type: I, input: Number.MAX_SAFE_INTEGER, ok: true },
  { id: 'val-int-accepts-a-float-with-a-zero-fraction', src: 'janux', type: I, input: 5.0, ok: true },
  { id: 'val-int-rejects-a-float', src: 'angular:validators#integer', type: I, input: 1.5, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-a-tiny-fraction', src: 'janux', type: I, input: 1.0000001, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-nan', src: 'angular:validators#NaN', type: I, input: Number.NaN, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-infinity', src: 'janux', type: I, input: Number.POSITIVE_INFINITY, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-negative-infinity', src: 'janux', type: I, input: Number.NEGATIVE_INFINITY, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-a-numeric-string', src: 'vue:componentProps#no-coercion', type: I, input: '1', ok: false, message: 'expected int' },
  { id: 'val-int-rejects-an-empty-string', src: 'janux', type: I, input: '', ok: false, message: 'expected int' },
  { id: 'val-int-rejects-a-boolean', src: 'janux', type: I, input: true, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-a-bigint', src: 'janux', type: I, input: 1n, ok: false, message: 'expected int' },
  { id: 'val-int-rejects-a-one-element-array', src: 'angular:validators#array-coercion', type: I, input: [1], ok: false, message: 'expected int' },
  { id: 'val-int-min-accepts-exactly-the-bound', src: 'angular:validators#min-boundary', type: () => int().min(1), input: 1, ok: true },
  { id: 'val-int-min-rejects-one-below', src: 'angular:validators#min', type: () => int().min(1), input: 0, ok: false, message: 'below min 1' },
  { id: 'val-int-max-accepts-exactly-the-bound', src: 'angular:validators#max-boundary', type: () => int().max(99), input: 99, ok: true },
  { id: 'val-int-max-rejects-one-above', src: 'angular:validators#max', type: () => int().max(99), input: 100, ok: false, message: 'above max 99' },
  { id: 'val-int-negative-bound-accepts-a-negative-value', src: 'janux', type: () => int().min(-5), input: -5, ok: true },
  { id: 'val-int-bounds-reject-below-a-negative-min', src: 'janux', type: () => int().min(-5), input: -6, ok: false, message: 'below min -5' },

  // ── number ──────────────────────────────────────────────────────────────────
  { id: 'val-num-accepts-a-float', src: 'janux', type: N, input: 1.5, ok: true },
  { id: 'val-num-accepts-an-integer', src: 'janux', type: N, input: 2, ok: true },
  { id: 'val-num-accepts-a-tiny-float', src: 'janux', type: N, input: Number.MIN_VALUE, ok: true },
  { id: 'val-num-rejects-nan', src: 'janux', type: N, input: Number.NaN, ok: false, message: 'expected number' },
  { id: 'val-num-rejects-infinity', src: 'janux', type: N, input: Number.POSITIVE_INFINITY, ok: false, message: 'expected number' },
  { id: 'val-num-rejects-a-numeric-string', src: 'janux', type: N, input: '1.5', ok: false, message: 'expected number' },
  { id: 'val-num-bounds-compare-value-not-length', src: 'janux', type: () => num().max(1), input: 0.5, ok: true },
  { id: 'val-num-max-rejects-above', src: 'janux', type: () => num().max(1), input: 1.5, ok: false, message: 'above max 1' },

  // ── boolean ─────────────────────────────────────────────────────────────────
  { id: 'val-bool-accepts-true', src: 'vue:componentProps#type-Boolean', type: B, input: true, ok: true },
  { id: 'val-bool-accepts-false', src: 'janux', type: B, input: false, ok: true },
  { id: 'val-bool-rejects-zero', src: 'vue:componentProps#no-truthiness', type: B, input: 0, ok: false, message: 'expected boolean' },
  { id: 'val-bool-rejects-one', src: 'janux', type: B, input: 1, ok: false, message: 'expected boolean' },
  { id: 'val-bool-rejects-the-string-true', src: 'janux', type: B, input: 'true', ok: false, message: 'expected boolean' },
  { id: 'val-bool-rejects-the-string-false', src: 'janux', type: B, input: 'false', ok: false, message: 'expected boolean' },
  { id: 'val-bool-rejects-an-empty-string', src: 'janux', type: B, input: '', ok: false, message: 'expected boolean' },

  // ── money is an integer count of minor units ────────────────────────────────
  { id: 'val-money-accepts-cents', src: 'janux', type: M, input: 1999, ok: true },
  { id: 'val-money-accepts-zero', src: 'janux', type: M, input: 0, ok: true },
  { id: 'val-money-accepts-a-negative-amount-for-refunds', src: 'janux', type: M, input: -500, ok: true },
  { id: 'val-money-rejects-a-fractional-amount', src: 'janux', type: M, input: 19.99, ok: false, message: 'expected money' },
  { id: 'val-money-rejects-a-decimal-string', src: 'janux', type: M, input: '19.99', ok: false, message: 'expected money' },
  { id: 'val-money-rejects-nan', src: 'janux', type: M, input: Number.NaN, ok: false, message: 'expected money' },

  // ── enum ────────────────────────────────────────────────────────────────────
  { id: 'val-enum-accepts-a-listed-value', src: 'janux', type: () => enums(['a', 'b']), input: 'a', ok: true },
  { id: 'val-enum-rejects-an-unlisted-value', src: 'janux', type: () => enums(['a', 'b']), input: 'c', ok: false, message: 'expected one of: a, b' },
  { id: 'val-enum-is-case-sensitive', src: 'janux', type: () => enums(['a']), input: 'A', ok: false, message: 'expected one of: a' },
  { id: 'val-enum-rejects-a-number-that-looks-like-a-member', src: 'janux', type: () => enums(['1']), input: 1, ok: false, message: 'expected one of: 1' },
  { id: 'val-enum-rejects-a-trailing-space', src: 'janux', type: () => enums(['a']), input: 'a ', ok: false, message: 'expected one of: a' },
  { id: 'val-enum-with-no-members-rejects-everything', src: 'janux', type: () => enums([]), input: 'a', ok: false, message: 'expected one of: ' },
  { id: 'val-enum-accepts-an-empty-string-member', src: 'janux', type: () => enums(['']), input: '', ok: true },

  // ── list ────────────────────────────────────────────────────────────────────
  { id: 'val-list-accepts-an-empty-array', src: 'janux', type: () => list(I()), input: [], ok: true },
  { id: 'val-list-accepts-matching-items', src: 'janux', type: () => list(I()), input: [1, 2], ok: true },
  { id: 'val-list-rejects-a-wrong-item', src: 'janux', type: () => list(I()), input: [1, 'x'], ok: false, message: 'expected int', path: '[1]' },
  { id: 'val-list-reports-the-index-of-a-deeper-bad-item', src: 'janux', type: () => list(I()), input: [1, 2, 'x'], ok: false, message: 'expected int', path: '[2]' },
  { id: 'val-list-rejects-an-object', src: 'janux', type: () => list(I()), input: {}, ok: false, message: 'expected list' },
  { id: 'val-list-rejects-a-string', src: 'janux', type: () => list(S()), input: 'ab', ok: false, message: 'expected list' },
  { id: 'val-list-rejects-an-arraylike-object', src: 'janux', type: () => list(I()), input: { 0: 1, length: 1 }, ok: false, message: 'expected list' },
  { id: 'val-list-rejects-a-hole-as-a-missing-item', src: 'janux', type: () => list(I()), input: [1, , 3], ok: false, message: 'required' },
  { id: 'val-list-rejects-an-explicit-undefined-item', src: 'janux', type: () => list(I()), input: [1, undefined, 3], ok: false, message: 'required' },
  { id: 'val-list-rejects-a-null-item-when-not-nullable', src: 'janux', type: () => list(I()), input: [null], ok: false, message: 'not nullable' },
  { id: 'val-list-accepts-a-null-item-when-nullable', src: 'janux', type: () => list(int().nullable()), input: [null], ok: true },
  { id: 'val-list-accepts-a-hole-when-the-item-is-optional', src: 'janux', type: () => list(int().optional()), input: [1, , 3], ok: true, value: [1, undefined, 3] },
  { id: 'val-list-of-objects-validates-each', src: 'janux', type: () => list({ n: I() }), input: [{ n: 1 }, { n: 2 }], ok: true },
  { id: 'val-list-of-objects-rejects-one-bad-field', src: 'janux', type: () => list({ n: I() }), input: [{ n: 1 }, { n: 'x' }], ok: false, message: 'expected int' },
  { id: 'val-list-of-objects-strips-unknown-keys-per-item', src: 'janux', type: () => list({ n: I() }), input: [{ n: 1, extra: true }], ok: true, value: [{ n: 1 }] },
  { id: 'val-nested-list-validates-inner-items', src: 'janux', type: () => list(list(I())), input: [[1], [2, 'x']], ok: false, message: 'expected int' },

  // ── object ──────────────────────────────────────────────────────────────────
  { id: 'val-obj-accepts-a-matching-shape', src: 'janux', type: () => obj({ n: I() }), input: { n: 1 }, ok: true },
  { id: 'val-obj-strips-unknown-keys', src: 'vue:componentProps#extraneous-props', type: () => obj({ n: I() }), input: { n: 1, extra: 'x' }, ok: true, value: { n: 1 } },
  { id: 'val-obj-rejects-a-missing-required-field', src: 'janux', type: () => obj({ n: I() }), input: {}, ok: false, message: 'required' },
  { id: 'val-obj-rejects-null', src: 'janux', type: () => obj({ n: I() }), input: null, ok: false, message: 'not nullable' },
  { id: 'val-obj-rejects-an-array', src: 'janux', type: () => obj({ n: I() }), input: [], ok: false, message: 'expected object' },
  { id: 'val-obj-rejects-a-string', src: 'janux', type: () => obj({ n: I() }), input: 'x', ok: false, message: 'expected object' },
  { id: 'val-obj-accepts-an-empty-shape', src: 'janux', type: () => obj({}), input: {}, ok: true, value: {} },
  { id: 'val-obj-empty-shape-strips-everything', src: 'janux', type: () => obj({}), input: { a: 1 }, ok: true, value: {} },
  { id: 'val-obj-nested-shape-validates-deeply', src: 'janux', type: () => obj({ a: obj({ b: I() }) }), input: { a: { b: 1 } }, ok: true },
  { id: 'val-obj-nested-shape-reports-the-nested-path', src: 'janux', type: () => obj({ a: obj({ b: I() }) }), input: { a: { b: 'x' } }, ok: false, message: 'expected int', path: 'a.b' },
  { id: 'val-obj-reports-a-top-level-field-path', src: 'janux', type: () => obj({ n: I() }), input: { n: 'x' }, ok: false, message: 'expected int', path: 'n' },
  { id: 'val-obj-reports-the-path-of-a-missing-field', src: 'janux', type: () => obj({ n: I() }), input: {}, ok: false, message: 'required', path: 'n' },
  { id: 'val-list-of-objects-reports-index-and-field', src: 'janux', type: () => list({ n: I() }), input: [{ n: 1 }, { n: 'x' }], ok: false, message: 'expected int', path: '[1].n' },
  { id: 'val-nested-list-reports-both-indices', src: 'janux', type: () => list(list(I())), input: [[1], [2, 'x']], ok: false, message: 'expected int', path: '[1][1]' },
  { id: 'val-obj-field-order-follows-the-shape-not-the-input', src: 'janux', type: () => obj({ a: I(), b: I() }), input: { b: 2, a: 1 }, ok: true, value: { a: 1, b: 2 } },

  // ── prototype keys are data, never structure ─────────────────────────────────
  { id: 'val-obj-drops-a-proto-key-it-did-not-declare', src: 'janux', type: () => obj({ n: I() }), input: JSON.parse('{"n":1,"__proto__":{"pwned":true}}'), ok: true, value: { n: 1 } },
  { id: 'val-obj-drops-an-undeclared-constructor-key', src: 'janux', type: () => obj({ n: I() }), input: JSON.parse('{"n":1,"constructor":{"x":1}}'), ok: true, value: { n: 1 } },
  { id: 'val-obj-drops-an-undeclared-prototype-key', src: 'janux', type: () => obj({ n: I() }), input: JSON.parse('{"n":1,"prototype":{"x":1}}'), ok: true, value: { n: 1 } },
  { id: 'val-list-drops-proto-keys-inside-items', src: 'janux', type: () => list({ n: I() }), input: JSON.parse('[{"n":1,"__proto__":{"x":1}}]'), ok: true, value: [{ n: 1 }] },

  // ── optional, nullable, required ────────────────────────────────────────────
  { id: 'val-missing-required-field-fails', src: 'janux', type: I, input: undefined, ok: false, message: 'required' },
  { id: 'val-missing-optional-field-passes-as-undefined', src: 'janux', type: () => int().optional(), input: undefined, ok: true, value: undefined },
  { id: 'val-missing-nullable-field-passes-as-null', src: 'janux', type: () => int().nullable(), input: undefined, ok: true, value: null },
  { id: 'val-explicit-null-fails-when-not-nullable', src: 'janux', type: I, input: null, ok: false, message: 'not nullable' },
  { id: 'val-explicit-null-passes-when-nullable', src: 'janux', type: () => int().nullable(), input: null, ok: true, value: null },
  { id: 'val-explicit-null-fails-when-only-optional', src: 'janux', type: () => int().optional(), input: null, ok: false, message: 'not nullable' },
  { id: 'val-optional-still-validates-a-present-value', src: 'janux', type: () => int().optional(), input: 'x', ok: false, message: 'expected int' },
  { id: 'val-nullable-still-validates-a-present-value', src: 'janux', type: () => int().nullable(), input: 'x', ok: false, message: 'expected int' },

  // ── defaults are validated like anything else ───────────────────────────────
  { id: 'val-default-applies-when-missing', src: 'janux', type: () => int().default(7), input: undefined, ok: true, value: 7 },
  { id: 'val-default-is-ignored-when-a-value-is-present', src: 'janux', type: () => int().default(7), input: 1, ok: true, value: 1 },
  { id: 'val-default-does-not-apply-to-an-explicit-null', src: 'janux', type: () => int().default(7), input: null, ok: false, message: 'not nullable' },
  { id: 'val-a-default-of-the-wrong-type-is-rejected', src: 'janux', type: () => int().default('nope'), input: undefined, ok: false, message: 'expected int' },
  { id: 'val-a-default-violating-its-own-bound-is-rejected', src: 'janux', type: () => int().min(10).default(1), input: undefined, ok: false, message: 'below min 10' },
  { id: 'val-a-default-object-of-the-wrong-shape-is-rejected', src: 'janux', type: () => obj({ n: I() }).default({ n: 'x' }), input: undefined, ok: false, message: 'expected int' },
  { id: 'val-a-valid-default-object-is-accepted', src: 'janux', type: () => obj({ n: I() }).default({ n: 1 }), input: undefined, ok: true, value: { n: 1 } },
  { id: 'val-a-default-list-is-validated-per-item', src: 'janux', type: () => list(I()).default([1, 'x']), input: undefined, ok: false, message: 'expected int' },
  { id: 'val-a-default-of-null-is-accepted-when-nullable', src: 'janux', type: () => int().nullable().default(null), input: undefined, ok: true, value: null },
  { id: 'val-a-default-of-null-is-rejected-when-not-nullable', src: 'janux', type: () => int().default(null), input: undefined, ok: false, message: 'not nullable' },
  { id: 'val-a-default-of-zero-is-applied-not-treated-as-absent', src: 'janux', type: () => int().default(0), input: undefined, ok: true, value: 0 },
  { id: 'val-a-default-of-empty-string-is-applied', src: 'janux', type: () => str().default(''), input: undefined, ok: true, value: '' },
  { id: 'val-a-default-of-false-is-applied', src: 'janux', type: () => bool().default(false), input: undefined, ok: true, value: false },
  { id: 'val-a-nested-default-fills-a-missing-field', src: 'janux', type: () => obj({ n: int().default(3) }), input: {}, ok: true, value: { n: 3 } },
  { id: 'val-a-nested-bad-default-fails-the-parent', src: 'janux', type: () => obj({ n: int().default('x') }), input: {}, ok: false, message: 'expected int' },
];
