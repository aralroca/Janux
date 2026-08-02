import type { Case } from '../support/case';

/**
 * `<0>…</0>` / `<tag>…</tag>` marker replacement in translated strings.
 *
 * The expected column is the raw element tree (`$t`/`$p` nodes), so these rows
 * pin the parser itself rather than a rendered serialization: what counts as a
 * marker (backreferenced closing tag, optional spaces, self-closing form),
 * what never does (attributes, mismatched pairs), and the two safety rules the
 * Brisa lineage promises — an unmatched marker renders only its content, and a
 * string with no markers at all comes back as the same string, not an array.
 */
export interface FormatElementsCase {
  value: string;
  /** `$t`/`$p` stand-ins for JSX elements, keyed by index or name. */
  elements?: Record<string, { $t: string; $p: Record<string, unknown> }> | { $t: string; $p: Record<string, unknown> }[];
  expected: unknown;
}

export type FormatElementsRow = Case<FormatElementsCase>;

const STRONG = { $t: 'strong', $p: {} };
const EM = { $t: 'em', $p: {} };
const BR = { $t: 'br', $p: {} };

export const FORMAT_ELEMENTS_CASES: FormatElementsRow[] = [
  // ── what parses ─────────────────────────────────────────────────────────────
  { id: 'i18n-el-wraps-an-indexed-marker', src: 'brisa:translate-core#format-elements', value: 'a <0>b</0> c', elements: [STRONG], expected: ['a ', { $t: 'strong', $p: { children: 'b' } }, ' c'] },
  { id: 'i18n-el-wraps-a-named-marker', src: 'brisa:translate-core#format-elements', value: 'x <bold>y</bold>', elements: { bold: STRONG }, expected: ['x ', { $t: 'strong', $p: { children: 'y' } }] },
  { id: 'i18n-el-self-closing-marker', src: 'brisa:translate-core#format-elements', value: 'a <0/> b', elements: [BR], expected: ['a ', { $t: 'br', $p: { children: '' } }, ' b'] },
  { id: 'i18n-el-self-closing-marker-with-a-space', src: 'brisa:translate-core#format-elements', value: 'a <0 /> b', elements: [BR], expected: ['a ', { $t: 'br', $p: { children: '' } }, ' b'] },
  { id: 'i18n-el-spaces-inside-the-tags-are-tolerated', src: 'brisa:translate-core#format-elements', value: '<0 >a</0 >', elements: [STRONG], expected: [{ $t: 'strong', $p: { children: 'a' } }] },
  { id: 'i18n-el-nested-markers-nest-the-tree', src: 'brisa:translate-core#format-elements', value: '<0>a <1>b</1> c</0>', elements: [STRONG, EM], expected: [{ $t: 'strong', $p: { children: ['a ', { $t: 'em', $p: { children: 'b' } }, ' c'] } }] },
  { id: 'i18n-el-consecutive-markers', src: 'janux', value: '<0>a</0><1>b</1>', elements: [STRONG, EM], expected: [{ $t: 'strong', $p: { children: 'a' } }, { $t: 'em', $p: { children: 'b' } }] },
  { id: 'i18n-el-the-same-marker-may-repeat', src: 'janux', value: '<0>a</0>-<0>b</0>', elements: [STRONG], expected: [{ $t: 'strong', $p: { children: 'a' } }, '-', { $t: 'strong', $p: { children: 'b' } }] },
  { id: 'i18n-el-multi-digit-index', src: 'janux', value: '<10>x</10>', elements: { 10: EM }, expected: [{ $t: 'em', $p: { children: 'x' } }] },
  { id: 'i18n-el-an-empty-marker-keeps-the-element', src: 'janux', value: '<0></0>', elements: [STRONG], expected: [{ $t: 'strong', $p: { children: '' } }] },

  // ── missing elements never leak markup ──────────────────────────────────────
  { id: 'i18n-el-an-unmatched-index-keeps-only-the-content', src: 'brisa:translate-core#format-elements', value: 'hello <9>world</9>', elements: [], expected: ['hello ', 'world'] },
  { id: 'i18n-el-an-unmatched-name-keeps-only-the-content', src: 'janux', value: 'a <u>b</u>', elements: {}, expected: ['a ', 'b'] },
  { id: 'i18n-el-an-index-beyond-the-array-keeps-only-the-content', src: 'janux', value: '<2>x</2>', elements: [STRONG], expected: ['x'] },
  { id: 'i18n-el-an-unmatched-self-closing-marker-vanishes', src: 'janux', value: 'a <5/> b', elements: [], expected: ['a ', ' b'] },
  { id: 'i18n-el-no-elements-argument-still-strips-markers', src: 'brisa:translate-core#format-elements', value: 'x <0>y</0>', expected: ['x ', 'y'] },

  // ── what never parses ───────────────────────────────────────────────────────
  { id: 'i18n-el-a-string-without-markers-stays-a-string', src: 'janux', value: 'plain text', elements: [STRONG], expected: 'plain text' },
  { id: 'i18n-el-attributes-disqualify-a-tag', src: 'janux', value: '<a href="x">y</a>', elements: { a: STRONG }, expected: '<a href="x">y</a>' },
  { id: 'i18n-el-a-mismatched-closing-tag-does-not-parse', src: 'janux', value: '<a>x</b>', elements: { a: STRONG, b: EM }, expected: '<a>x</b>' },

  // ── newline normalization only happens when markers are present ────────────
  { id: 'i18n-el-newlines-are-stripped-around-markers', src: 'janux', value: 'a\nb <0>c</0>', elements: [EM], expected: ['ab ', { $t: 'em', $p: { children: 'c' } }] },
  { id: 'i18n-el-crlf-is-stripped-too', src: 'janux', value: 'a\r\n<0>b</0>', elements: [STRONG], expected: ['a', { $t: 'strong', $p: { children: 'b' } }] },
  { id: 'i18n-el-newlines-survive-when-nothing-parses', src: 'janux', value: 'a\nb', elements: [EM], expected: 'a\nb' },
];
