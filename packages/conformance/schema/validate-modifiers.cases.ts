import { enums, int, list, money, num, obj, str } from 'janux';
import type { ValidateRow } from './validate.cases';

/**
 * Modifier interplay and hostile structure, same row shape as `validate.cases`.
 *
 * Three themes. Precedence: a default outranks both `optional` and `nullable`,
 * and `.default(undefined)` is no default at all. Bounds: they only ever see a
 * present value (never `null`, never a skipped optional), they compare by value
 * even when the bound is fractional, and a *defaulted* value is bound-checked
 * like any other. Structure: what passes the object shell (getters, inherited
 * and null-prototype objects) versus what only looks like it should (`Date`,
 * `Map`, functions) — the inputs a validator meets when state does not come
 * from `JSON.parse`.
 */
export const VALIDATE_MODIFIER_CASES: ValidateRow[] = [
  // ── precedence between optional, nullable and default ───────────────────────
  { id: 'sch-val-optional-and-nullable-accept-undefined-as-undefined', src: 'janux', type: () => int().optional().nullable(), input: undefined, ok: true, value: undefined },
  { id: 'sch-val-optional-and-nullable-accept-null-as-null', src: 'janux', type: () => int().optional().nullable(), input: null, ok: true, value: null },
  { id: 'sch-val-a-default-beats-optional', src: 'janux', type: () => int().optional().default(7), input: undefined, ok: true, value: 7 },
  { id: 'sch-val-a-default-beats-nullable', src: 'janux', type: () => int().nullable().default(7), input: undefined, ok: true, value: 7 },
  { id: 'sch-val-a-default-of-undefined-is-no-default', src: 'janux', type: () => int().default(undefined), input: undefined, ok: false, message: 'required' },

  // ── defaults at depth ───────────────────────────────────────────────────────
  { id: 'sch-val-a-nested-default-applies-at-depth', src: 'janux', type: () => obj({ a: obj({ b: int().default(2) }) }), input: { a: {} }, ok: true, value: { a: { b: 2 } } },
  { id: 'sch-val-a-defaulted-object-fills-the-whole-subtree', src: 'janux', type: () => obj({ a: obj({ b: int() }).default({ b: 1 }) }), input: {}, ok: true, value: { a: { b: 1 } } },
  { id: 'sch-val-defaults-cascade-through-a-defaulted-object', src: 'janux', type: () => obj({ a: obj({ b: int().default(3) }).default({}) }), input: {}, ok: true, value: { a: { b: 3 } } },
  { id: 'sch-val-a-default-list-applies-when-missing', src: 'janux', type: () => list(int()).default([1, 2]), input: undefined, ok: true, value: [1, 2] },
  { id: 'sch-val-a-hole-is-filled-by-the-item-default', src: 'janux', type: () => list(int().default(5)), input: [1, , 3], ok: true, value: [1, 5, 3] },
  { id: 'sch-val-a-nullable-field-missing-inside-an-object-becomes-null', src: 'janux', type: () => obj({ a: int().nullable() }), input: {}, ok: true, value: { a: null } },
  { id: 'sch-val-an-optional-field-inside-an-object-may-be-absent', src: 'janux', type: () => obj({ a: int(), b: str().optional() }), input: { a: 1 }, ok: true, value: { a: 1, b: undefined } },

  // ── enums with modifiers ────────────────────────────────────────────────────
  { id: 'sch-val-an-enum-default-member-applies', src: 'janux', type: () => enums(['a', 'b']).default('b'), input: undefined, ok: true, value: 'b' },
  { id: 'sch-val-an-enum-default-outside-the-members-is-rejected', src: 'janux', type: () => enums(['a']).default('b'), input: undefined, ok: false, message: 'expected one of: a' },
  { id: 'sch-val-an-optional-enum-passes-when-missing', src: 'janux', type: () => enums(['a']).optional(), input: undefined, ok: true, value: undefined },
  { id: 'sch-val-a-nullable-enum-accepts-null', src: 'janux', type: () => enums(['a']).nullable(), input: null, ok: true, value: null },
  { id: 'sch-val-a-nullable-enum-still-rejects-a-non-member', src: 'janux', type: () => enums(['a']).nullable(), input: 'b', ok: false, message: 'expected one of: a' },
  { id: 'sch-val-an-enum-null-fails-with-nullability-not-membership', src: 'janux', type: () => enums(['a']), input: null, ok: false, message: 'not nullable' },
  { id: 'sch-val-the-enum-message-joins-members-verbatim', src: 'janux', type: () => enums(['a,b', 'c']), input: 'x', ok: false, message: 'expected one of: a,b, c' },
  { id: 'sch-val-enum-matches-unicode-members-by-identity', src: 'janux', type: () => enums(['ñ']), input: 'ñ', ok: true },

  // ── containers with modifiers ───────────────────────────────────────────────
  { id: 'sch-val-an-optional-list-passes-when-missing', src: 'janux', type: () => list(int()).optional(), input: undefined, ok: true, value: undefined },
  { id: 'sch-val-a-nullable-list-accepts-null', src: 'janux', type: () => list(int()).nullable(), input: null, ok: true, value: null },
  { id: 'sch-val-a-nullable-object-accepts-null', src: 'janux', type: () => obj({ n: int() }).nullable(), input: null, ok: true, value: null },
  { id: 'sch-val-an-optional-object-still-validates-a-present-value', src: 'janux', type: () => obj({ n: int() }).optional(), input: { n: 'x' }, ok: false, message: 'expected int', path: 'n' },
  { id: 'sch-val-list-items-normalize-their-defaults-per-item', src: 'janux', type: () => list(obj({ n: int().default(1) })), input: [{}, {}], ok: true, value: [{ n: 1 }, { n: 1 }] },

  // ── bounds only ever see a present value ────────────────────────────────────
  { id: 'sch-val-bounds-do-not-apply-to-null', src: 'janux', type: () => int().min(5).nullable(), input: null, ok: true, value: null },
  { id: 'sch-val-bounds-do-not-apply-when-optional-and-missing', src: 'janux', type: () => str().min(3).optional(), input: undefined, ok: true, value: undefined },
  { id: 'sch-val-a-defaulted-string-is-length-checked', src: 'janux', type: () => str().min(3).default('ab'), input: undefined, ok: false, message: 'below min 3' },
  { id: 'sch-val-a-default-above-max-is-rejected', src: 'janux', type: () => int().min(1).max(3).default(5), input: undefined, ok: false, message: 'above max 3' },
  { id: 'sch-val-money-max-rejects-one-above', src: 'janux', type: () => money().max(100), input: 101, ok: false, message: 'above max 100' },
  { id: 'sch-val-money-min-accepts-exactly-a-negative-bound', src: 'janux', type: () => money().min(-100), input: -100, ok: true },
  { id: 'sch-val-negative-zero-satisfies-a-zero-min', src: 'janux', type: () => num().min(0), input: -0, ok: true },
  { id: 'sch-val-negative-zero-satisfies-a-zero-max', src: 'janux', type: () => int().max(0), input: -0, ok: true },
  { id: 'sch-val-a-fractional-bound-on-an-int-compares-by-value', src: 'janux', type: () => int().min(1.5), input: 2, ok: true },
  { id: 'sch-val-a-fractional-bound-rejects-the-integer-below-it', src: 'janux', type: () => int().min(1.5), input: 1, ok: false, message: 'below min 1.5' },
  { id: 'sch-val-num-accepts-a-value-exactly-on-a-float-bound', src: 'janux', type: () => num().min(0.5), input: 0.5, ok: true },
  { id: 'sch-val-str-max-zero-accepts-only-empty', src: 'janux', type: () => str().max(0), input: '', ok: true },
  { id: 'sch-val-str-max-zero-rejects-one-char', src: 'janux', type: () => str().max(0), input: 'a', ok: false, message: 'above max 0' },
  { id: 'sch-val-min-is-reported-before-max-when-both-are-violated', src: 'janux', type: () => int().min(5).max(2), input: 3, ok: false, message: 'below min 5' },

  // ── the object shell: what passes and what only looks like it should ────────
  { id: 'sch-val-a-date-passes-the-shell-but-has-no-fields', src: 'janux', type: () => obj({ n: int() }), input: new Date(0), ok: false, message: 'required', path: 'n' },
  { id: 'sch-val-a-map-entry-is-not-a-property', src: 'janux', type: () => obj({ n: int() }), input: new Map([['n', 1]]), ok: false, message: 'required', path: 'n' },
  { id: 'sch-val-a-function-is-not-an-object', src: 'janux', type: () => obj({ n: int() }), input: () => 1, ok: false, message: 'expected object' },
  { id: 'sch-val-an-inherited-property-is-read', src: 'janux', type: () => obj({ n: int() }), input: Object.create({ n: 1 }), ok: true, value: { n: 1 } },
  { id: 'sch-val-a-getter-property-is-read', src: 'janux', type: () => obj({ n: int() }), input: { get n() { return 1; } }, ok: true, value: { n: 1 } },
  { id: 'sch-val-a-null-prototype-object-is-fine', src: 'janux', type: () => obj({ n: int() }), input: Object.assign(Object.create(null), { n: 3 }), ok: true, value: { n: 3 } },
  { id: 'sch-val-symbol-keyed-extras-are-dropped', src: 'janux', type: () => obj({ n: int() }), input: { n: 4, [Symbol('s')]: 2 }, ok: true, value: { n: 4 } },
  { id: 'sch-val-a-frozen-input-is-fine-because-output-is-fresh', src: 'janux', type: () => obj({ k: int() }), input: Object.freeze({ k: 2 }), ok: true, value: { k: 2 } },
  { id: 'sch-val-strips-unknown-keys-at-every-depth', src: 'janux', type: () => obj({ a: obj({ b: int() }) }), input: { a: { b: 1, z: 9 }, y: 2 }, ok: true, value: { a: { b: 1 } } },

  // ── paths compose through any nesting ───────────────────────────────────────
  { id: 'sch-val-a-four-level-path', src: 'janux', type: () => obj({ a: obj({ b: obj({ c: obj({ d: int() }) }) }) }), input: { a: { b: { c: { d: 'x' } } } }, ok: false, message: 'expected int', path: 'a.b.c.d' },
  { id: 'sch-val-a-path-mixes-list-and-object-segments', src: 'janux', type: () => obj({ a: list(list(obj({ b: int() }))) }), input: { a: [[{ b: 'x' }]] }, ok: false, message: 'expected int', path: 'a[0][0].b' },
];
