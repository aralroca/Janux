import { deepSubset, resolveRefs, type StepOutcome } from '../../janux-cli/src/eval-runner';
import type { Case } from '../support/case';

/**
 * How `janux eval` decides a scenario passed.
 *
 * An eval file is a CI gate over an app's agent surface, so both halves of it
 * have to be exact: a reference that silently resolves to `undefined` turns the
 * next step into a call with no arguments, and a matcher that is too generous
 * turns the whole gate green while the agent surface is broken. Structural
 * subset matching is the deliberate looseness — extra fields in the response are
 * fine — and everything else is strict, `NaN` and `-0` included.
 */

/** The outcomes earlier steps left behind, which references read from. */
export const OUTCOMES: StepOutcome[] = [
  { status: 200, ok: true, result: { id: 'p1', items: [{ sku: 'a' }, { sku: 'b' }] } },
  { status: 409, ok: false, error: 'already settled' },
];

export interface RefCase {
  value: unknown;
  resolved: unknown;
}

export type RefRow = Case<RefCase>;

export const REF_CASES: RefRow[] = [
  { id: 'cli2-eval-ref-reads-a-field-of-an-earlier-result', src: 'janux', value: '$steps[0].result.id', resolved: 'p1' },
  { id: 'cli2-eval-ref-reads-the-status-of-an-earlier-step', src: 'janux', value: '$steps[0].status', resolved: 200 },
  { id: 'cli2-eval-ref-reads-a-false-flag-without-mistaking-it-for-absent', src: 'janux', value: '$steps[1].ok', resolved: false },
  { id: 'cli2-eval-ref-walks-into-an-array-by-index', src: 'janux', value: '$steps[0].result.items.1.sku', resolved: 'b' },
  { id: 'cli2-eval-ref-reads-the-error-a-failed-step-reported', src: 'janux', value: '$steps[1].error', resolved: 'already settled' },
  { id: 'cli2-eval-ref-leaves-an-ordinary-string-alone', src: 'janux', value: 'p1', resolved: 'p1' },
  { id: 'cli2-eval-ref-needs-a-field-to-read-not-just-a-step', src: 'janux', value: '$steps[0]', resolved: '$steps[0]' },
  { id: 'cli2-eval-ref-resolves-inside-an-array', src: 'janux', value: ['$steps[0].result.id', 2], resolved: ['p1', 2] },
  { id: 'cli2-eval-ref-resolves-however-deeply-nested-it-sits', src: 'janux', value: { order: { proposal: '$steps[0].result.id' } }, resolved: { order: { proposal: 'p1' } } },
  { id: 'cli2-eval-ref-leaves-a-number-alone', src: 'janux', value: 42, resolved: 42 },
  { id: 'cli2-eval-ref-leaves-null-alone', src: 'janux', value: null, resolved: null },
];

export interface RefErrorCase {
  value: unknown;
  /** Substring the error must carry, so the reference that failed is named. */
  says: string;
}

export type RefErrorRow = Case<RefErrorCase>;

export const REF_ERROR_CASES: RefErrorRow[] = [
  { id: 'cli2-eval-ref-refuses-a-field-the-step-never-returned', src: 'janux', value: '$steps[0].result.missing', says: '$steps[0].result.missing' },
  { id: 'cli2-eval-ref-refuses-a-step-that-never-ran', src: 'janux', value: '$steps[7].status', says: '$steps[7].status' },
  { id: 'cli2-eval-ref-refuses-an-unresolvable-reference-nested-in-a-body', src: 'janux', value: { id: '$steps[3].result.id' }, says: '$steps[3].result.id' },
];

export interface MatchCase {
  expected: unknown;
  actual: unknown;
  matches: boolean;
}

export type MatchRow = Case<MatchCase>;

export const MATCH_CASES: MatchRow[] = [
  // ── strictness on primitives ────────────────────────────────────────────────
  { id: 'cli2-eval-match-equal-numbers', src: 'janux', expected: 1, actual: 1, matches: true },
  { id: 'cli2-eval-match-never-coerces-a-number-to-its-string', src: 'janux', expected: 1, actual: '1', matches: false },
  { id: 'cli2-eval-match-never-coerces-a-boolean-to-a-number', src: 'janux', expected: true, actual: 1, matches: false },
  { id: 'cli2-eval-match-treats-two-nans-as-the-same-value', src: 'janux', expected: NaN, actual: NaN, matches: true },
  { id: 'cli2-eval-match-keeps-minus-zero-apart-from-zero', src: 'janux', expected: 0, actual: -0, matches: false },
  { id: 'cli2-eval-match-never-mistakes-null-for-a-missing-field', src: 'janux', expected: null, actual: undefined, matches: false },
  { id: 'cli2-eval-match-null-against-null', src: 'janux', expected: null, actual: null, matches: true },

  // ── objects and arrays ──────────────────────────────────────────────────────
  { id: 'cli2-eval-match-ignores-fields-the-scenario-did-not-mention', src: 'janux', expected: { id: 'p1' }, actual: { id: 'p1', total: 9 }, matches: true },
  { id: 'cli2-eval-match-fails-on-a-field-the-response-never-had', src: 'janux', expected: { id: 'p1' }, actual: { total: 9 }, matches: false },
  { id: 'cli2-eval-match-recurses-into-nested-objects', src: 'janux', expected: { order: { id: 'p1' } }, actual: { order: { id: 'p1', total: 9 } }, matches: true },
  { id: 'cli2-eval-match-fails-when-an-object-was-expected-and-a-string-arrived', src: 'janux', expected: { id: 'p1' }, actual: 'p1', matches: false },
  { id: 'cli2-eval-match-fails-when-an-object-was-expected-and-null-arrived', src: 'janux', expected: { id: 'p1' }, actual: null, matches: false },
  { id: 'cli2-eval-match-accepts-a-longer-array-than-the-one-it-described', src: 'janux', expected: [1], actual: [1, 2], matches: true },
  { id: 'cli2-eval-match-fails-when-the-array-is-shorter-than-described', src: 'janux', expected: [1, 2], actual: [1], matches: false },
  { id: 'cli2-eval-match-never-reads-an-object-as-an-array', src: 'janux', expected: [1], actual: { 0: 1 }, matches: false },
  { id: 'cli2-eval-match-an-empty-object-asserts-only-that-something-object-shaped-arrived', src: 'janux', expected: {}, actual: { a: 1 }, matches: true },
  { id: 'cli2-eval-match-an-empty-object-still-refuses-a-primitive', src: 'janux', expected: {}, actual: 5, matches: false },

  // ── matchers ────────────────────────────────────────────────────────────────
  { id: 'cli2-eval-match-absent-asserts-a-field-is-not-there', src: 'janux', expected: '$absent', actual: undefined, matches: true },
  { id: 'cli2-eval-match-absent-is-not-satisfied-by-an-explicit-null', src: 'janux', expected: '$absent', actual: null, matches: false },
  { id: 'cli2-eval-match-absent-works-on-a-field-of-an-object', src: 'janux', expected: { secret: '$absent' }, actual: { id: 'p1' }, matches: true },
  { id: 'cli2-eval-match-absent-fails-when-the-field-is-there', src: 'janux', expected: { secret: '$absent' }, actual: { secret: 'x' }, matches: false },
  { id: 'cli2-eval-match-some-finds-an-item-wherever-it-sits', src: 'janux', expected: { $some: { sku: 'b' } }, actual: [{ sku: 'a' }, { sku: 'b' }], matches: true },
  { id: 'cli2-eval-match-some-fails-when-no-item-matches', src: 'janux', expected: { $some: { sku: 'z' } }, actual: [{ sku: 'a' }], matches: false },
  { id: 'cli2-eval-match-some-fails-on-something-that-is-not-a-list', src: 'janux', expected: { $some: 1 }, actual: 1, matches: false },
  { id: 'cli2-eval-match-some-fails-on-an-empty-list', src: 'janux', expected: { $some: 1 }, actual: [], matches: false },
  { id: 'cli2-eval-match-some-nested-under-a-field', src: 'janux', expected: { items: { $some: { sku: 'b' } } }, actual: { items: [{ sku: 'a' }, { sku: 'b' }] }, matches: true },
  { id: 'cli2-eval-match-not-inverts-a-match', src: 'janux', expected: { $not: { status: 'settled' } }, actual: { status: 'pending' }, matches: true },
  { id: 'cli2-eval-match-not-fails-when-the-thing-it-forbids-is-there', src: 'janux', expected: { $not: { status: 'settled' } }, actual: { status: 'settled' }, matches: false },
  { id: 'cli2-eval-match-not-composes-with-absent', src: 'janux', expected: { $not: '$absent' }, actual: 1, matches: true },
  { id: 'cli2-eval-match-a-matcher-key-beside-a-literal-one-is-a-literal-key', src: 'janux', expected: { $some: 1, id: 'p1' }, actual: { $some: 1, id: 'p1' }, matches: true },
];

/** Re-exported so the runner does not import the CLI twice. */
export { deepSubset, resolveRefs };
