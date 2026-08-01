import { bool, enums, int, list, money, num, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * `buildDefault` — the initial value a schema seeds into state.
 *
 * The precedence is explicit `.default()` first, then `null` for nullables,
 * then the structural seed (`[]` for lists, recursion for objects, the first
 * member for enums) and finally the kind's zero value. Two deliberate
 * asymmetries are pinned here: `optional` does NOT change the seed (state
 * always starts with a value; optionality is about *input*), and `buildDefault`
 * never validates — a wrong `.default()` comes back verbatim, because
 * `validate` has the final word when the value moves.
 */
export interface InitialValueCase {
  type: () => JxType;
  expected: unknown;
}

export type InitialValueRow = Case<InitialValueCase>;

export const INITIAL_VALUE_CASES: InitialValueRow[] = [
  // ── zero values per kind ────────────────────────────────────────────────────
  { id: 'sch-init-string-seeds-empty', src: 'janux', type: () => str(), expected: '' },
  { id: 'sch-init-int-seeds-zero', src: 'janux', type: () => int(), expected: 0 },
  { id: 'sch-init-num-seeds-zero', src: 'janux', type: () => num(), expected: 0 },
  { id: 'sch-init-bool-seeds-false', src: 'janux', type: () => bool(), expected: false },
  { id: 'sch-init-money-seeds-zero', src: 'janux', type: () => money(), expected: 0 },
  { id: 'sch-init-enum-seeds-its-first-member', src: 'janux', type: () => enums(['a', 'b']), expected: 'a' },
  { id: 'sch-init-an-empty-string-member-can-be-the-seed', src: 'janux', type: () => enums(['']), expected: '' },
  { id: 'sch-init-list-seeds-empty', src: 'janux', type: () => list(int()), expected: [] },
  { id: 'sch-init-object-seeds-recursively', src: 'janux', type: () => obj({ n: int() }), expected: { n: 0 } },
  { id: 'sch-init-empty-shape-seeds-an-empty-object', src: 'janux', type: () => obj({}), expected: {} },

  // ── nullable wins over the structural seed ──────────────────────────────────
  { id: 'sch-init-a-nullable-scalar-seeds-null', src: 'janux', type: () => str().nullable(), expected: null },
  { id: 'sch-init-a-nullable-list-seeds-null-not-empty', src: 'janux', type: () => list(int()).nullable(), expected: null },
  { id: 'sch-init-a-nullable-object-seeds-null-not-a-shape', src: 'janux', type: () => obj({ n: int() }).nullable(), expected: null },
  { id: 'sch-init-a-nullable-enum-seeds-null-not-a-member', src: 'janux', type: () => enums(['a']).nullable(), expected: null },
  { id: 'sch-init-optional-does-not-change-the-seed', src: 'janux', type: () => int().optional(), expected: 0 },
  { id: 'sch-init-nullable-beats-optional', src: 'janux', type: () => int().optional().nullable(), expected: null },

  // ── an explicit default wins over everything ────────────────────────────────
  { id: 'sch-init-a-default-wins-over-the-zero', src: 'janux', type: () => int().default(7), expected: 7 },
  { id: 'sch-init-a-default-wins-over-nullable', src: 'janux', type: () => int().nullable().default(7), expected: 7 },
  { id: 'sch-init-a-default-of-false-is-respected', src: 'janux', type: () => bool().default(false), expected: false },
  { id: 'sch-init-a-list-default-seeds-the-list', src: 'janux', type: () => list(int()).default([1]), expected: [1] },

  // ── buildDefault never validates ────────────────────────────────────────────
  { id: 'sch-init-a-wrong-typed-default-comes-back-verbatim', src: 'janux', type: () => int().default('x'), expected: 'x' },
  { id: 'sch-init-a-default-of-null-comes-back-verbatim', src: 'janux', type: () => int().default(null), expected: null },
  { id: 'sch-init-bounds-do-not-shift-the-zero', src: 'janux', type: () => int().min(5), expected: 0 },
  { id: 'sch-init-item-defaults-do-not-seed-the-list', src: 'janux', type: () => list(int().default(5)), expected: [] },

  // ── every rule at once ──────────────────────────────────────────────────────
  {
    id: 'sch-init-object-fields-mix-every-rule',
    src: 'janux',
    type: () => obj({ a: obj({ b: str() }), c: enums(['x', 'y']), d: list(int()), e: int().default(9), f: num().nullable() }),
    expected: { a: { b: '' }, c: 'x', d: [], e: 9, f: null },
  },
];
