import type { Case } from '../support/case';

/**
 * Complexity growth, asserted as a ratio rather than a stopwatch.
 *
 * The wall-clock budgets in `dos.cases.ts` nearly let a real ReDoS through: the PII
 * email pattern was quadratic, and at 20k characters it took 198ms against a 250ms
 * budget — so it passed on a fast laptop and only failed on the slower CI runner.
 * An absolute budget is a statement about the machine; a growth ratio is a statement
 * about the algorithm, and it holds on any hardware.
 *
 * Each row feeds a site two input sizes 4× apart. Linear work grows ~4×; quadratic
 * work grows ~16×. The threshold sits well above the first and far below the second,
 * so noise cannot trip it but a complexity regression cannot hide either.
 */
export interface GrowthCase {
  site: 'pii-scrub' | 'unicode-normalize' | 'i18n-interpolation' | 'escape-attribute' | 'route-match' | 'schema-validate' | 'query-hash';
  /** Input shape, as in the DoS matrix — the ones with no match to find. */
  shape: 'separators' | 'plain' | 'escapable' | 'digits';
}

export type GrowthRow = Case<GrowthCase>;

const SITES: GrowthCase['site'][] = [
  'pii-scrub',
  'unicode-normalize',
  'i18n-interpolation',
  'escape-attribute',
  'route-match',
  'schema-validate',
  'query-hash',
];

const SHAPES: GrowthCase['shape'][] = ['separators', 'plain', 'escapable', 'digits'];

export const GROWTH_CASES: GrowthRow[] = SITES.flatMap((site) =>
  SHAPES.map((shape) => ({ id: `growth-${site}-${shape}`, src: 'janux', site, shape })),
);
