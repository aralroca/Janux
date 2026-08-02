import { bool, enums, int, list, money, num, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * What `coerceForm` hands to `validate` — coercion in isolation, no verdict.
 *
 * The contract has three planks. Numbers: a string on a numeric kind goes
 * through `Number`, except a blank/whitespace field, which must stay invalid
 * rather than become `0`. Booleans: the checkbox idiom (`'on'`/absent) plus the
 * hidden-input pair (`'true'`/`'false'`/`'off'`), case-sensitive, and absence
 * only becomes `false` when the field is required. Everything else — enums,
 * strings, already-typed values, mismatched shapes — passes through untouched,
 * because validation, not coercion, has the final word.
 */
export interface CoerceFormCase {
  type: () => JxType;
  /** The raw submitted value, exactly as FormData would deliver it. */
  input: unknown;
  /** The value `coerceForm` produces. */
  coerced: unknown;
}

export type CoerceFormRow = Case<CoerceFormCase>;

export const COERCE_FORM_CASES: CoerceFormRow[] = [
  // ── numeric strings and the kinds that parse them ───────────────────────────
  { id: 'sch-coerce-numeric-string-becomes-a-number-for-int', src: 'janux', type: () => int(), input: '42', coerced: 42 },
  { id: 'sch-coerce-numeric-string-stays-a-string-for-str', src: 'janux', type: () => str(), input: '42', coerced: '42' },
  { id: 'sch-coerce-numeric-string-stays-a-string-for-enum', src: 'janux', type: () => enums(['1', '2']), input: '1', coerced: '1' },
  { id: 'sch-coerce-blank-string-stays-blank-not-zero', src: 'janux', type: () => int(), input: '', coerced: '' },
  { id: 'sch-coerce-whitespace-string-stays-not-zero', src: 'janux', type: () => num(), input: '   ', coerced: '   ' },
  { id: 'sch-coerce-padded-numeric-string-parses', src: 'janux', type: () => int(), input: ' 42 ', coerced: 42 },
  { id: 'sch-coerce-decimal-string-parses-for-num', src: 'janux', type: () => num(), input: '19.99', coerced: 19.99 },
  { id: 'sch-coerce-money-is-parsed-but-never-scaled', src: 'janux', type: () => money(), input: '19.99', coerced: 19.99 },
  { id: 'sch-coerce-money-parses-whole-minor-units', src: 'janux', type: () => money(), input: '1999', coerced: 1999 },
  { id: 'sch-coerce-hex-string-parses-via-number', src: 'janux', type: () => int(), input: '0x1f', coerced: 31 },
  { id: 'sch-coerce-exponent-string-parses', src: 'janux', type: () => int(), input: '1e3', coerced: 1000 },
  { id: 'sch-coerce-plus-prefixed-string-parses', src: 'janux', type: () => int(), input: '+5', coerced: 5 },
  { id: 'sch-coerce-infinity-word-parses-validation-rejects-it-later', src: 'janux', type: () => num(), input: 'Infinity', coerced: Number.POSITIVE_INFINITY },
  { id: 'sch-coerce-nan-word-stays-a-string', src: 'janux', type: () => num(), input: 'NaN', coerced: 'NaN' },
  { id: 'sch-coerce-non-numeric-text-stays', src: 'janux', type: () => int(), input: 'abc', coerced: 'abc' },
  { id: 'sch-coerce-an-already-typed-number-passes-through', src: 'janux', type: () => int(), input: 7, coerced: 7 },
  { id: 'sch-coerce-null-passes-through-numeric-coercion', src: 'janux', type: () => int(), input: null, coerced: null },
  { id: 'sch-coerce-an-array-passes-through-a-scalar-kind', src: 'janux', type: () => int(), input: ['1'], coerced: ['1'] },

  // ── checkbox semantics ──────────────────────────────────────────────────────
  { id: 'sch-coerce-checkbox-on-becomes-true', src: 'janux', type: () => bool(), input: 'on', coerced: true },
  { id: 'sch-coerce-the-word-true-becomes-true', src: 'janux', type: () => bool(), input: 'true', coerced: true },
  { id: 'sch-coerce-checkbox-off-becomes-false', src: 'janux', type: () => bool(), input: 'off', coerced: false },
  { id: 'sch-coerce-the-word-false-becomes-false', src: 'janux', type: () => bool(), input: 'false', coerced: false },
  { id: 'sch-coerce-boolean-words-are-case-sensitive', src: 'janux', type: () => bool(), input: 'ON', coerced: 'ON' },
  { id: 'sch-coerce-the-digit-one-is-not-a-boolean', src: 'janux', type: () => bool(), input: '1', coerced: '1' },
  { id: 'sch-coerce-an-absent-required-checkbox-becomes-false', src: 'janux', type: () => bool(), input: undefined, coerced: false },
  { id: 'sch-coerce-an-absent-optional-checkbox-stays-absent', src: 'janux', type: () => bool().optional(), input: undefined, coerced: undefined },
  { id: 'sch-coerce-an-absent-nullable-checkbox-stays-absent', src: 'janux', type: () => bool().nullable(), input: undefined, coerced: undefined },
  { id: 'sch-coerce-a-typed-boolean-passes-through', src: 'janux', type: () => bool(), input: true, coerced: true },
  { id: 'sch-coerce-null-passes-through-boolean-coercion', src: 'janux', type: () => bool(), input: null, coerced: null },

  // ── structure recurses; mismatched structure passes through ─────────────────
  { id: 'sch-coerce-object-fields-coerce-by-shape', src: 'janux', type: () => obj({ n: int() }), input: { n: '2' }, coerced: { n: 2 } },
  { id: 'sch-coerce-unknown-keys-survive-coercion', src: 'janux', type: () => obj({ n: int() }), input: { n: '2', extra: 'x' }, coerced: { n: 2, extra: 'x' } },
  { id: 'sch-coerce-a-missing-required-checkbox-is-injected-into-an-object', src: 'janux', type: () => obj({ agreed: bool() }), input: {}, coerced: { agreed: false } },
  { id: 'sch-coerce-nested-objects-coerce-recursively', src: 'janux', type: () => obj({ a: obj({ n: int() }) }), input: { a: { n: '3' } }, coerced: { a: { n: 3 } } },
  { id: 'sch-coerce-list-items-coerce', src: 'janux', type: () => list(int()), input: ['1', '2'], coerced: [1, 2] },
  { id: 'sch-coerce-a-list-of-checkbox-values-coerces', src: 'janux', type: () => list(bool()), input: ['on', 'off'], coerced: [true, false] },
  { id: 'sch-coerce-a-string-is-not-a-list', src: 'janux', type: () => list(int()), input: 'a,b', coerced: 'a,b' },
  { id: 'sch-coerce-a-string-is-not-an-object', src: 'janux', type: () => obj({ n: int() }), input: 'x', coerced: 'x' },
];
