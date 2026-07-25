import { Fragment, jsx } from 'janux';
import type { Case } from '../support/case';

/**
 * Element and tree serialization through `renderToString`.
 *
 * The set of things a server renderer has to get right about *children* is
 * small, sharply defined and endlessly re-broken: which values render as
 * nothing, which render as text, whether a void element can have children,
 * how fragments and arrays flatten, and where the raw-HTML escape hatch is
 * allowed to bypass escaping. Cases follow `react:ReactDOMServerIntegrationElements`
 * and `vue:ssrRender`.
 */
export interface TreeCase {
  /** Built lazily so each row renders a fresh tree. */
  node: () => unknown;
  /** Exactly the HTML `renderToString` must produce. */
  expected: string;
}

export type TreeRow = Case<TreeCase>;

const el = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);
const text = (tag: string, children: unknown) => jsx(tag, { children });

export const ELEMENT_CASES: TreeRow[] = [
  // ── the empty renders ───────────────────────────────────────────────────────
  { id: 'tree-null-renders-nothing', src: 'react:Elements#null', node: () => null, expected: '' },
  { id: 'tree-undefined-renders-nothing', src: 'react:Elements#undefined', node: () => undefined, expected: '' },
  { id: 'tree-true-renders-nothing', src: 'react:Elements#boolean-true', node: () => true, expected: '' },
  { id: 'tree-false-renders-nothing', src: 'react:Elements#boolean-false', node: () => false, expected: '' },
  { id: 'tree-empty-array-renders-nothing', src: 'react:Elements#empty-array', node: () => [], expected: '' },
  { id: 'tree-empty-string-renders-nothing', src: 'react:Elements#empty-string', node: () => '', expected: '' },

  // ── scalars as children ─────────────────────────────────────────────────────
  { id: 'tree-string-renders-as-text', src: 'react:Elements#string-child', node: () => 'hi', expected: 'hi' },
  { id: 'tree-number-renders-as-text', src: 'react:Elements#number-child', node: () => 42, expected: '42' },
  { id: 'tree-zero-renders-as-text', src: 'react:Elements#zero-child', node: () => 0, expected: '0' },
  { id: 'tree-nan-renders-as-text', src: 'janux', node: () => Number.NaN, expected: 'NaN' },
  { id: 'tree-text-escapes-angle-brackets', src: 'react:Elements#escape-text', node: () => '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
  { id: 'tree-text-escapes-ampersand', src: 'react:Elements#escape-amp-text', node: () => 'a & b', expected: 'a &amp; b' },
  { id: 'tree-text-escapes-double-quote', src: 'janux', node: () => 'say "hi"', expected: 'say &quot;hi&quot;' },
  { id: 'tree-text-leaves-single-quote', src: 'janux', node: () => "it's", expected: "it's" },
  { id: 'tree-text-keeps-emoji', src: 'janux', node: () => '🎉', expected: '🎉' },
  { id: 'tree-text-keeps-rtl', src: 'janux', node: () => 'مرحبا', expected: 'مرحبا' },

  // ── elements ────────────────────────────────────────────────────────────────
  { id: 'tree-empty-element', src: 'react:Elements#empty-div', node: () => el('div'), expected: '<div></div>' },
  { id: 'tree-element-with-text', src: 'react:Elements#div-with-text', node: () => text('div', 'hi'), expected: '<div>hi</div>' },
  { id: 'tree-element-with-attribute-and-text', src: 'react:Elements#div-with-attr', node: () => jsx('div', { id: 'a', children: 'hi' }), expected: '<div id="a">hi</div>' },
  { id: 'tree-element-with-number-child', src: 'janux', node: () => text('span', 7), expected: '<span>7</span>' },
  { id: 'tree-element-with-null-child', src: 'react:Elements#null-child', node: () => text('div', null), expected: '<div></div>' },
  { id: 'tree-element-with-false-child', src: 'react:Elements#false-child', node: () => text('div', false), expected: '<div></div>' },
  { id: 'tree-nested-elements', src: 'react:Elements#nested', node: () => text('div', text('span', 'hi')), expected: '<div><span>hi</span></div>' },
  { id: 'tree-deeply-nested-elements', src: 'janux', node: () => text('a', text('b', text('c', 'x'))), expected: '<a><b><c>x</c></b></a>' },
  { id: 'tree-sibling-children-concatenate', src: 'react:Elements#siblings', node: () => text('div', [text('span', 'a'), text('span', 'b')]), expected: '<div><span>a</span><span>b</span></div>' },
  { id: 'tree-mixed-text-and-element-children', src: 'react:Elements#mixed-children', node: () => text('p', ['a', text('b', 'B'), 'c']), expected: '<p>a<b>B</b>c</p>' },
  { id: 'tree-nested-arrays-flatten', src: 'react:Elements#nested-arrays', node: () => text('div', [['a', 'b'], ['c']]), expected: '<div>abc</div>' },
  { id: 'tree-array-with-holes-skips-them', src: 'janux', node: () => text('div', ['a', null, undefined, false, 'b']), expected: '<div>ab</div>' },
  { id: 'tree-adjacent-text-children-are-not-separated', src: 'react:Elements#adjacent-text', node: () => text('div', ['a', 'b']), expected: '<div>ab</div>' },

  // ── void elements ───────────────────────────────────────────────────────────
  { id: 'tree-void-br-self-closes', src: 'react:Elements#void-br', node: () => el('br'), expected: '<br/>' },
  { id: 'tree-void-img-self-closes-with-attrs', src: 'react:Elements#void-img', node: () => el('img', { src: 'a.png' }), expected: '<img src="a.png"/>' },
  { id: 'tree-void-input-self-closes', src: 'react:Elements#void-input', node: () => el('input', { type: 'text' }), expected: '<input type="text"/>' },
  { id: 'tree-void-hr-self-closes', src: 'janux', node: () => el('hr'), expected: '<hr/>' },
  { id: 'tree-void-meta-self-closes', src: 'janux', node: () => el('meta', { charset: 'utf-8' }), expected: '<meta charset="utf-8"/>' },
  { id: 'tree-void-link-self-closes', src: 'janux', node: () => el('link', { rel: 'icon' }), expected: '<link rel="icon"/>' },
  { id: 'tree-void-area-self-closes', src: 'janux', node: () => el('area'), expected: '<area/>' },
  { id: 'tree-void-base-self-closes', src: 'janux', node: () => el('base'), expected: '<base/>' },
  { id: 'tree-void-col-self-closes', src: 'janux', node: () => el('col'), expected: '<col/>' },
  { id: 'tree-void-embed-self-closes', src: 'janux', node: () => el('embed'), expected: '<embed/>' },
  { id: 'tree-void-source-self-closes', src: 'janux', node: () => el('source'), expected: '<source/>' },
  { id: 'tree-void-track-self-closes', src: 'janux', node: () => el('track'), expected: '<track/>' },
  { id: 'tree-void-wbr-self-closes', src: 'janux', node: () => el('wbr'), expected: '<wbr/>' },
  { id: 'tree-void-element-ignores-children', src: 'react:Elements#void-with-children', node: () => text('br', 'ignored'), expected: '<br/>' },
  { id: 'tree-non-void-element-with-a-void-name-lookalike-still-closes', src: 'janux', node: () => text('brx', 'x'), expected: '<brx>x</brx>' },

  // ── fragments ───────────────────────────────────────────────────────────────
  { id: 'tree-fragment-renders-only-its-children', src: 'react:Fragment#basic', node: () => jsx(Fragment, { children: 'hi' }), expected: 'hi' },
  { id: 'tree-fragment-with-multiple-children', src: 'react:Fragment#multiple', node: () => jsx(Fragment, { children: [text('a', '1'), text('b', '2')] }), expected: '<a>1</a><b>2</b>' },
  { id: 'tree-empty-fragment-renders-nothing', src: 'react:Fragment#empty', node: () => jsx(Fragment, {}), expected: '' },
  { id: 'tree-nested-fragments-flatten', src: 'react:Fragment#nested', node: () => jsx(Fragment, { children: jsx(Fragment, { children: 'x' }) }), expected: 'x' },
  { id: 'tree-fragment-inside-an-element', src: 'janux', node: () => text('div', jsx(Fragment, { children: ['a', 'b'] })), expected: '<div>ab</div>' },

  // ── function components inline, no island ───────────────────────────────────
  { id: 'tree-function-component-is-inlined', src: 'react:Elements#function-component', node: () => jsx(() => text('p', 'hi'), {}), expected: '<p>hi</p>' },
  { id: 'tree-function-component-receives-its-props', src: 'react:Elements#function-props', node: () => jsx(({ n }: any) => text('p', n), { n: 5 }), expected: '<p>5</p>' },
  { id: 'tree-function-component-returning-null-renders-nothing', src: 'react:Elements#component-null', node: () => jsx(() => null, {}), expected: '' },
  { id: 'tree-function-component-returning-a-fragment', src: 'janux', node: () => jsx(() => jsx(Fragment, { children: ['a', 'b'] }), {}), expected: 'ab' },
  { id: 'tree-function-component-returning-an-array', src: 'janux', node: () => jsx(() => ['a', 'b'], {}), expected: 'ab' },
  { id: 'tree-nested-function-components', src: 'janux', node: () => jsx(() => jsx(() => text('i', 'x'), {}), {}), expected: '<i>x</i>' },

  // ── the raw escape hatch ────────────────────────────────────────────────────
  { id: 'tree-dangerhtml-is-not-escaped', src: 'react:Elements#dangerouslySetInnerHTML', node: () => jsx('div', { dangerHTML: '<b>bold</b>' }), expected: '<div><b>bold</b></div>' },
  { id: 'tree-dangerhtml-wins-over-children', src: 'janux', node: () => jsx('div', { dangerHTML: '<b>raw</b>', children: 'ignored' }), expected: '<div><b>raw</b></div>' },
  { id: 'tree-dangerhtml-empty-string-empties-the-element', src: 'janux', node: () => jsx('div', { dangerHTML: '', children: 'ignored' }), expected: '<div></div>' },
  { id: 'tree-dangerhtml-non-string-falls-back-to-children', src: 'janux', node: () => jsx('div', { dangerHTML: 42, children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'tree-dangerhtml-on-a-void-element-is-ignored', src: 'janux', node: () => jsx('br', { dangerHTML: '<b>x</b>' }), expected: '<br/>' },

  // ── tag names are emitted as given ──────────────────────────────────────────
  { id: 'tree-custom-element-tag', src: 'janux', node: () => text('my-widget', 'x'), expected: '<my-widget>x</my-widget>' },
  { id: 'tree-uppercase-tag-is-emitted-verbatim', src: 'janux', node: () => text('DIV', 'x'), expected: '<DIV>x</DIV>' },
];
