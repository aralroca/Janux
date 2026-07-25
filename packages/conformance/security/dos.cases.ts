import type { Case } from '../support/case';

/**
 * Denial of service: every place Janux runs a regex or a recursive walk over input
 * it did not write, against inputs designed to make that work explode.
 *
 * Asserted against a wall-clock budget rather than an output, because the failure
 * mode *is* the time. A ReDoS does not return a wrong answer — it returns the right
 * one, minutes later, having pinned a request thread. One of these caught a real
 * 739ms i18n regression before the fix landed.
 */
export interface DosCase {
  site:
    | 'escape-text'
    | 'attribute-value'
    | 'style-object'
    | 'route-match'
    | 'route-typed-matcher'
    | 'i18n-interpolation'
    | 'i18n-plural'
    | 'pii-scrub'
    | 'unicode-normalize'
    | 'schema-validate'
    | 'query-hash'
    | 'state-clone';
  /** How the hostile input is shaped. */
  shape: string;
}

export type DosRow = Case<DosCase>;

/** Each shape is a distinct way to make a linear algorithm quadratic or worse. */
const SHAPES = [
  'long-plain',
  'long-escapable',
  'many-separators',
  'nested-quantifier-bait',
  'many-placeholders',
  'deep-nesting',
  'wide-object',
  'many-digits',
  'many-control-chars',
];

const SITES: DosCase['site'][] = [
  'escape-text',
  'attribute-value',
  'style-object',
  'route-match',
  'route-typed-matcher',
  'i18n-interpolation',
  'i18n-plural',
  'pii-scrub',
  'unicode-normalize',
  'schema-validate',
  'query-hash',
  'state-clone',
];

export const DOS_CASES: DosRow[] = SITES.flatMap((site) =>
  SHAPES.map((shape) => ({ id: `dos-${site}-${shape}`, src: 'janux', site, shape })),
);
