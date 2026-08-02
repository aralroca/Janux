import { bool, enums, int, list, money, num, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * The full form pipeline: `coerceForm` then `validate`, one row per verdict.
 *
 * The scalar cells live in `form-matrix.cases.ts`; these rows cover what the
 * matrix cannot say — structure (whole forms, nested shapes, multi-selects),
 * bounds applied to the *coerced* value, defaults that fire only on true
 * absence (a blank field is present and invalid, never defaulted), and the
 * checkbox rule that an unchecked box beats even `.default(true)`, because
 * unchecked means false, not missing.
 */
export interface FormPipelineCase {
  type: () => JxType;
  /** The raw submission, exactly as a form intent would receive it. */
  input: unknown;
  ok: boolean;
  /** Expected output when `ok`; omitted means "same as input". */
  value?: unknown;
  /** Substring the first error message must contain, when not `ok`. */
  message?: string;
  /** Exact `path` of the first error, when the location is the point of the case. */
  path?: string;
}

export type FormPipelineRow = Case<FormPipelineCase>;

export const FORM_PIPELINE_CASES: FormPipelineRow[] = [
  // ── whole forms ─────────────────────────────────────────────────────────────
  { id: 'sch-pipe-a-full-form-submits-with-typed-values', src: 'janux', type: () => obj({ name: str(), age: int(), agreed: bool() }), input: { name: 'Ada', age: '36' }, ok: true, value: { name: 'Ada', age: 36, agreed: false } },
  { id: 'sch-pipe-an-unknown-form-field-is-stripped-after-coercion', src: 'janux', type: () => obj({ n: int() }), input: { n: '1', csrf: 'tok' }, ok: true, value: { n: 1 } },
  { id: 'sch-pipe-a-blank-required-int-field-fails', src: 'janux', type: () => obj({ n: int() }), input: { n: '' }, ok: false, message: 'expected int', path: 'n' },
  { id: 'sch-pipe-a-blank-field-is-present-not-missing', src: 'janux', type: () => int().optional(), input: '', ok: false, message: 'expected int' },

  // ── bounds check the coerced value ──────────────────────────────────────────
  { id: 'sch-pipe-bounds-reject-the-coerced-number', src: 'janux', type: () => int().min(10), input: '9', ok: false, message: 'below min 10' },
  { id: 'sch-pipe-bounds-accept-the-coerced-number', src: 'janux', type: () => int().min(10), input: '10', ok: true, value: 10 },
  { id: 'sch-pipe-a-numeric-string-on-a-str-field-is-length-checked', src: 'janux', type: () => str().min(3), input: '42', ok: false, message: 'below min 3' },

  // ── money: minor units in, minor units out ──────────────────────────────────
  { id: 'sch-pipe-money-form-input-is-minor-units', src: 'janux', type: () => money(), input: '1999', ok: true, value: 1999 },
  { id: 'sch-pipe-a-decimal-money-input-is-rejected-not-scaled', src: 'janux', type: () => money(), input: '10.50', ok: false, message: 'expected money' },
  { id: 'sch-pipe-money-bounds-check-the-parsed-amount', src: 'janux', type: () => money().min(0), input: '-500', ok: false, message: 'below min 0' },

  // ── selects and multi-selects ───────────────────────────────────────────────
  { id: 'sch-pipe-a-select-value-matches-an-enum', src: 'janux', type: () => enums(['s', 'm']), input: 's', ok: true },
  { id: 'sch-pipe-a-numeric-select-value-stays-a-string-for-an-enum', src: 'janux', type: () => enums(['1', '2']), input: '1', ok: true, value: '1' },
  { id: 'sch-pipe-a-multi-select-of-ints-coerces-per-item', src: 'janux', type: () => list(int()), input: ['1', '2'], ok: true, value: [1, 2] },
  { id: 'sch-pipe-a-multi-select-reports-the-bad-entry', src: 'janux', type: () => list(int()), input: ['1', 'x'], ok: false, message: 'expected int', path: '[1]' },

  // ── checkboxes inside structure ─────────────────────────────────────────────
  { id: 'sch-pipe-a-nested-absent-checkbox-defaults-to-false', src: 'janux', type: () => obj({ prefs: obj({ dark: bool() }) }), input: { prefs: {} }, ok: true, value: { prefs: { dark: false } } },
  { id: 'sch-pipe-a-checked-checkbox-inside-an-object', src: 'janux', type: () => obj({ dark: bool() }), input: { dark: 'on' }, ok: true, value: { dark: true } },
  { id: 'sch-pipe-a-hidden-input-pair-submits-false', src: 'janux', type: () => obj({ dark: bool() }), input: { dark: 'false' }, ok: true, value: { dark: false } },
  { id: 'sch-pipe-an-absent-nullable-checkbox-becomes-null', src: 'janux', type: () => bool().nullable(), input: undefined, ok: true, value: null },
  { id: 'sch-pipe-an-absent-optional-checkbox-stays-undefined', src: 'janux', type: () => bool().optional(), input: undefined, ok: true, value: undefined },
  { id: 'sch-pipe-an-absent-checkbox-beats-a-default-of-true', src: 'janux', type: () => bool().default(true), input: undefined, ok: true, value: false },

  // ── defaults fire on absence, never on a blank ──────────────────────────────
  { id: 'sch-pipe-a-blank-field-does-not-trigger-a-default', src: 'janux', type: () => int().default(7), input: '', ok: false, message: 'expected int' },
  { id: 'sch-pipe-a-missing-field-triggers-the-default-after-coercion', src: 'janux', type: () => obj({ n: int().default(7) }), input: {}, ok: true, value: { n: 7 } },
  { id: 'sch-pipe-coerced-items-and-defaults-combine', src: 'janux', type: () => obj({ qty: int().default(1), tags: list(str()) }), input: { tags: ['a'] }, ok: true, value: { qty: 1, tags: ['a'] } },

  // ── the Number gotchas keep their parsed value ──────────────────────────────
  { id: 'sch-pipe-hex-form-input-parses-to-thirty-one', src: 'janux', type: () => int(), input: '0x1f', ok: true, value: 31 },
  { id: 'sch-pipe-exponent-form-input-parses-to-a-thousand', src: 'janux', type: () => int(), input: '1e3', ok: true, value: 1000 },
  { id: 'sch-pipe-padded-numeric-input-parses-to-the-number', src: 'janux', type: () => int(), input: ' 42 ', ok: true, value: 42 },

  // ── deep structure ──────────────────────────────────────────────────────────
  { id: 'sch-pipe-a-deep-form-path-reports-through-coercion', src: 'janux', type: () => obj({ items: list(obj({ qty: int() })) }), input: { items: [{ qty: '2' }, { qty: 'x' }] }, ok: false, message: 'expected int', path: 'items[1].qty' },
  { id: 'sch-pipe-a-deep-form-coerces-every-level', src: 'janux', type: () => obj({ items: list(obj({ qty: int(), gift: bool() })) }), input: { items: [{ qty: '2' }] }, ok: true, value: { items: [{ qty: 2, gift: false }] } },
];
