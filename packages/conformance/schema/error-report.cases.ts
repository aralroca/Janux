import { enums, int, list, obj, str, type JxType } from 'janux';
import type { Case } from '../support/case';

/**
 * The full error report — every error, in order, not just the first.
 *
 * `validate` never aborts early: it collects one error per bad or missing
 * field, flattened in traversal order (shape order for objects, index order
 * for lists), so a form can mark every field in a single pass. The boundary
 * rows are the point: a parent that is itself wrong or `null` produces exactly
 * ONE error and stops descent — its children are unreachable, and phantom
 * child errors would send an agent fixing fields that do not exist.
 */
export interface ErrorReportCase {
  type: () => JxType;
  input: unknown;
  /** Every expected error, in order: exact path, substring of the message. */
  errors: { path: string; message: string }[];
}

export type ErrorReportRow = Case<ErrorReportCase>;

export const ERROR_REPORT_CASES: ErrorReportRow[] = [
  // ── no early abort: siblings all report ─────────────────────────────────────
  { id: 'sch-err-two-bad-fields-are-both-reported', src: 'janux', type: () => obj({ a: int(), b: str() }), input: { a: 'x', b: 1 }, errors: [{ path: 'a', message: 'expected int' }, { path: 'b', message: 'expected string' }] },
  { id: 'sch-err-errors-follow-shape-order-not-input-order', src: 'janux', type: () => obj({ a: int(), b: int() }), input: { b: 'y', a: 'x' }, errors: [{ path: 'a', message: 'expected int' }, { path: 'b', message: 'expected int' }] },
  { id: 'sch-err-two-bad-items-are-both-reported', src: 'janux', type: () => list(int()), input: ['x', 'y'], errors: [{ path: '[0]', message: 'expected int' }, { path: '[1]', message: 'expected int' }] },
  { id: 'sch-err-each-missing-field-gets-its-own-error', src: 'janux', type: () => obj({ a: int(), b: int() }), input: {}, errors: [{ path: 'a', message: 'required' }, { path: 'b', message: 'required' }] },
  { id: 'sch-err-wrong-and-missing-mix-in-one-report', src: 'janux', type: () => obj({ a: int(), b: int() }), input: { a: 'x' }, errors: [{ path: 'a', message: 'expected int' }, { path: 'b', message: 'required' }] },
  { id: 'sch-err-null-and-wrong-siblings-both-report', src: 'janux', type: () => obj({ a: int(), b: int() }), input: { a: null, b: 'x' }, errors: [{ path: 'a', message: 'not nullable' }, { path: 'b', message: 'expected int' }] },
  { id: 'sch-err-bound-violations-collect-across-fields', src: 'janux', type: () => obj({ s: str().min(3), n: int().max(2) }), input: { s: 'a', n: 5 }, errors: [{ path: 's', message: 'below min 3' }, { path: 'n', message: 'above max 2' }] },
  { id: 'sch-err-an-enum-error-collects-with-its-siblings', src: 'janux', type: () => obj({ size: enums(['s', 'm']), n: int() }), input: { size: 'x', n: 'y' }, errors: [{ path: 'size', message: 'expected one of: s, m' }, { path: 'n', message: 'expected int' }] },

  // ── flattening order across nesting ─────────────────────────────────────────
  { id: 'sch-err-nested-errors-flatten-in-traversal-order', src: 'janux', type: () => obj({ a: list(int()), b: int() }), input: { a: ['x', 2, 'y'], b: 'z' }, errors: [{ path: 'a[0]', message: 'expected int' }, { path: 'a[2]', message: 'expected int' }, { path: 'b', message: 'expected int' }] },
  { id: 'sch-err-nested-object-errors-flatten', src: 'janux', type: () => obj({ a: obj({ b: int(), c: int() }) }), input: { a: { b: 'x', c: 'y' } }, errors: [{ path: 'a.b', message: 'expected int' }, { path: 'a.c', message: 'expected int' }] },
  { id: 'sch-err-each-bad-list-item-field-is-reported', src: 'janux', type: () => list(obj({ n: int() })), input: [{ n: 'x' }, { n: 'y' }], errors: [{ path: '[0].n', message: 'expected int' }, { path: '[1].n', message: 'expected int' }] },
  { id: 'sch-err-deep-and-shallow-errors-flatten-together', src: 'janux', type: () => obj({ a: obj({ b: int() }), c: int() }), input: { a: { b: 'x' }, c: 'y' }, errors: [{ path: 'a.b', message: 'expected int' }, { path: 'c', message: 'expected int' }] },
  { id: 'sch-err-list-inside-object-inside-list', src: 'janux', type: () => list(obj({ a: list(int()) })), input: [{ a: ['x'] }, { a: [1, 'y'] }], errors: [{ path: '[0].a[0]', message: 'expected int' }, { path: '[1].a[1]', message: 'expected int' }] },

  // ── a broken parent stops descent with exactly one error ────────────────────
  { id: 'sch-err-a-bad-parent-stops-descent', src: 'janux', type: () => obj({ a: obj({ b: int() }) }), input: { a: 5 }, errors: [{ path: 'a', message: 'expected object' }] },
  { id: 'sch-err-a-null-parent-stops-descent', src: 'janux', type: () => obj({ a: obj({ b: int() }) }), input: { a: null }, errors: [{ path: 'a', message: 'not nullable' }] },
  { id: 'sch-err-a-missing-parent-reports-once', src: 'janux', type: () => obj({ a: obj({ b: int() }) }), input: {}, errors: [{ path: 'a', message: 'required' }] },

  // ── holes, gaps and sparse damage ───────────────────────────────────────────
  { id: 'sch-err-a-hole-and-a-wrong-item-both-report', src: 'janux', type: () => list(int()), input: [1, , 'x'], errors: [{ path: '[1]', message: 'required' }, { path: '[2]', message: 'expected int' }] },
  { id: 'sch-err-undefined-and-null-items-report-differently', src: 'janux', type: () => list(int()), input: [undefined, null], errors: [{ path: '[0]', message: 'required' }, { path: '[1]', message: 'not nullable' }] },
  { id: 'sch-err-only-the-bad-items-error', src: 'janux', type: () => list(int()), input: [1, 'x', 3, 'y', 5], errors: [{ path: '[1]', message: 'expected int' }, { path: '[3]', message: 'expected int' }] },
  { id: 'sch-err-a-single-bad-item-yields-a-single-error', src: 'janux', type: () => list(int()), input: ['x'], errors: [{ path: '[0]', message: 'expected int' }] },

  // ── defaults error where the field lives ────────────────────────────────────
  { id: 'sch-err-a-bad-default-reports-at-the-field-path', src: 'janux', type: () => obj({ n: int().default('x') }), input: {}, errors: [{ path: 'n', message: 'expected int' }] },
  { id: 'sch-err-a-default-bound-violation-reports-at-depth', src: 'janux', type: () => obj({ a: obj({ b: int().min(10).default(1) }) }), input: { a: {} }, errors: [{ path: 'a.b', message: 'below min 10' }] },

  // ── the root path is the empty string ───────────────────────────────────────
  { id: 'sch-err-a-root-scalar-error-has-an-empty-path', src: 'janux', type: () => int(), input: 'x', errors: [{ path: '', message: 'expected int' }] },
];
