import { Fragment, jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * Text children: exact bytes out for every input class.
 *
 * `security/escaping.cases.ts` asserts the *invariants* (nothing breaks out,
 * nothing is lost); this table asserts the *literal encodings*, which is what
 * catches an escaper that starts double-encoding, normalizing unicode, or
 * collapsing whitespace — all changes the invariant suite would wave through
 * as long as they stay lossless-ish. Number rows follow ECMAScript
 * `ToString`, which is the contract `{count}` interpolations actually rely on.
 */
const t = (children: unknown) => jsx('span', { children });

export const CHILD_ESCAPING_CASES: TreeRow[] = [
  // ── entities are data, so their ampersand is escaped — exactly once ─────────
  { id: 'childesc-named-entity-is-double-escaped', src: 'react:Elements#pre-encoded', node: () => t('&lt;'), expected: '<span>&amp;lt;</span>' },
  { id: 'childesc-numeric-entity-is-double-escaped', src: 'janux', node: () => t('&#60;'), expected: '<span>&amp;#60;</span>' },
  { id: 'childesc-hex-entity-is-double-escaped', src: 'janux', node: () => t('&#x3c;'), expected: '<span>&amp;#x3c;</span>' },
  { id: 'childesc-trailing-lone-ampersand', src: 'janux', node: () => t('a&'), expected: '<span>a&amp;</span>' },
  { id: 'childesc-all-four-specials-in-order', src: 'janux', node: () => t('<"&>'), expected: '<span>&lt;&quot;&amp;&gt;</span>' },
  { id: 'childesc-consecutive-angle-brackets', src: 'janux', node: () => t('a<<b'), expected: '<span>a&lt;&lt;b</span>' },
  { id: 'childesc-backtick-and-equals-are-not-escaped', src: 'janux', node: () => t('`a=b`'), expected: '<span>`a=b`</span>' },

  // ── unicode passes through untouched ────────────────────────────────────────
  { id: 'childesc-astral-plane-char-is-kept', src: 'janux', node: () => t('𝒥anux'), expected: '<span>𝒥anux</span>' },
  { id: 'childesc-combining-accent-is-not-normalized', src: 'janux', node: () => t('é'), expected: '<span>é</span>' },
  { id: 'childesc-zero-width-space-is-kept', src: 'janux', node: () => t('a\u200bb'), expected: '<span>a\u200bb</span>' },
  { id: 'childesc-soft-hyphen-is-kept-raw', src: 'janux', node: () => t('a\u00adb'), expected: '<span>a\u00adb</span>' },
  { id: 'childesc-nbsp-is-kept-raw-not-entity-encoded', src: 'janux', node: () => t('a\u00a0b'), expected: '<span>a\u00a0b</span>' },
  { id: 'childesc-bom-char-is-kept', src: 'janux', node: () => t('\ufeffa'), expected: '<span>\ufeffa</span>' },
  { id: 'childesc-control-char-is-kept', src: 'janux', node: () => t('a\u0001b'), expected: '<span>a\u0001b</span>' },
  { id: 'childesc-line-separator-is-kept', src: 'janux', node: () => t('a\u2028b'), expected: '<span>a\u2028b</span>' },

  // ── numbers: ECMAScript ToString, byte for byte ─────────────────────────────
  { id: 'childesc-negative-zero-renders-as-zero', src: 'janux', node: () => t(-0), expected: '<span>0</span>' },
  { id: 'childesc-infinity-renders-as-word', src: 'janux', node: () => t(Number.POSITIVE_INFINITY), expected: '<span>Infinity</span>' },
  { id: 'childesc-negative-infinity-renders-as-word', src: 'janux', node: () => t(Number.NEGATIVE_INFINITY), expected: '<span>-Infinity</span>' },
  { id: 'childesc-exponent-threshold-number', src: 'janux', node: () => t(1e21), expected: '<span>1e+21</span>' },
  { id: 'childesc-small-float-exponent-form', src: 'janux', node: () => t(1e-7), expected: '<span>1e-7</span>' },
  { id: 'childesc-max-safe-integer-keeps-every-digit', src: 'janux', node: () => t(Number.MAX_SAFE_INTEGER), expected: '<span>9007199254740991</span>' },
  { id: 'childesc-float-artifact-is-not-rounded', src: 'janux', node: () => t(0.1 + 0.2), expected: '<span>0.30000000000000004</span>' },
  { id: 'childesc-negative-float', src: 'janux', node: () => t(-1.5), expected: '<span>-1.5</span>' },
  { id: 'childesc-integer-valued-float-drops-its-point', src: 'janux', node: () => t(3.0), expected: '<span>3</span>' },

  // ── bigints render as text, with integer precision doubles lose ─────────────
  { id: 'childesc-bigint-renders-as-text', src: 'react:Elements#bigint-child', node: () => t(10n), expected: '<span>10</span>' },
  { id: 'childesc-bigint-beyond-double-precision-keeps-every-digit', src: 'janux', node: () => t(9007199254740993n), expected: '<span>9007199254740993</span>' },
  { id: 'childesc-bigint-zero', src: 'janux', node: () => t(0n), expected: '<span>0</span>' },
  { id: 'childesc-negative-bigint', src: 'janux', node: () => t(-5n), expected: '<span>-5</span>' },
  { id: 'childesc-bigint-at-the-root', src: 'janux', node: () => 10n, expected: '10' },

  // ── whitespace is data ──────────────────────────────────────────────────────
  { id: 'childesc-leading-and-trailing-spaces-survive', src: 'janux', node: () => t('  a  '), expected: '<span>  a  </span>' },
  { id: 'childesc-internal-runs-of-spaces-are-not-collapsed', src: 'janux', node: () => t('a   b'), expected: '<span>a   b</span>' },
  { id: 'childesc-tab-survives', src: 'janux', node: () => t('a\tb'), expected: '<span>a\tb</span>' },
  { id: 'childesc-lone-newline-child-survives', src: 'janux', node: () => t('\n'), expected: '<span>\n</span>' },
  { id: 'childesc-crlf-survives-unnormalized', src: 'janux', node: () => t('a\r\nb'), expected: '<span>a\r\nb</span>' },

  // ── arrays and fragments flatten with zero separators ───────────────────────
  { id: 'childesc-numbers-in-an-array-concatenate', src: 'janux', node: () => t([1, 2, 3]), expected: '<span>123</span>' },
  { id: 'childesc-three-levels-of-arrays-flatten', src: 'janux', node: () => t([[['a']], 'b']), expected: '<span>ab</span>' },
  { id: 'childesc-array-of-only-holes-renders-nothing', src: 'janux', node: () => t([null, false, undefined, true]), expected: '<span></span>' },
  { id: 'childesc-fragment-between-strings-adds-nothing', src: 'janux', node: () => t(['a', jsx(Fragment, { children: 'b' }), 'c']), expected: '<span>abc</span>' },
  { id: 'childesc-array-inside-fragment-inside-array', src: 'janux', node: () => t([jsx(Fragment, { children: ['a', ['b']] }), 'c']), expected: '<span>abc</span>' },

  // ── components feeding the text pipeline ────────────────────────────────────
  { id: 'childesc-component-string-return-is-escaped', src: 'react:Elements#component-string-return', node: () => jsx(() => '<b>', {}), expected: '&lt;b&gt;' },
  { id: 'childesc-component-zero-return-renders', src: 'janux', node: () => jsx(() => 0, {}), expected: '0' },
  { id: 'childesc-component-true-return-renders-nothing', src: 'janux', node: () => jsx(() => true, {}), expected: '' },
  { id: 'childesc-component-array-return-with-holes', src: 'janux', node: () => jsx(() => ['a', null, 'b'], {}), expected: 'ab' },
  { id: 'childesc-three-component-layers-deep', src: 'janux', node: () => jsx(() => jsx(() => jsx(() => 'deep', {}), {}), {}), expected: 'deep' },
];
