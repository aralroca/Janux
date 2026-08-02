import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * Tables and form controls, the two element families browsers rewrite while
 * parsing. Janux performs none of that rewriting: no `<tbody>` is synthesized
 * around a bare `<tr>`, `value` and `selected` stay where the author put
 * them (React hoists `<select value>` into per-option `selected`), and
 * whitespace between rows survives. What the parser then does with it is the
 * page's business — the serializer's contract is fidelity.
 */
const w = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);
const kid = (tag: string, children: unknown) => jsx(tag, { children });

export const TABLE_FORM_CASES: TreeRow[] = [
  // ── tables serialize as written ─────────────────────────────────────────────
  { id: 'formel-bare-tr-gets-no-synthesized-tbody', src: 'janux', node: () => kid('table', kid('tr', kid('td', 'x'))), expected: '<table><tr><td>x</td></tr></table>' },
  { id: 'formel-full-table-sections-keep-written-order', src: 'janux', node: () => kid('table', [kid('caption', 'c'), kid('colgroup', w('col', { span: 2 })), kid('thead', kid('tr', kid('th', 'h'))), kid('tbody', kid('tr', kid('td', 'b'))), kid('tfoot', kid('tr', kid('td', 'f')))]), expected: '<table><caption>c</caption><colgroup><col span="2"/></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>b</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>' },
  { id: 'formel-tfoot-before-tbody-is-not-reordered', src: 'janux', node: () => kid('table', [kid('tfoot', kid('tr', kid('td', 'f'))), kid('tbody', kid('tr', kid('td', 'b')))]), expected: '<table><tfoot><tr><td>f</td></tr></tfoot><tbody><tr><td>b</td></tr></tbody></table>' },
  { id: 'formel-cell-spans-are-numeric-attributes', src: 'janux', node: () => kid('tr', [jsx('th', { scope: 'row', children: 'h' }), jsx('td', { colspan: 2, rowspan: 3, children: 'x' })]), expected: '<tr><th scope="row">h</th><td colspan="2" rowspan="3">x</td></tr>' },
  // React refuses whitespace text inside <table>; Janux emits the tree as written.
  { id: 'formel-whitespace-between-rows-survives', src: 'janux', node: () => kid('tbody', ['\n  ', kid('tr', kid('td', 'x')), '\n']), expected: '<tbody>\n  <tr><td>x</td></tr>\n</tbody>' },

  // ── select and option ───────────────────────────────────────────────────────
  { id: 'formel-option-selected-renders-bare-in-place', src: 'react:Forms#option-selected', node: () => kid('select', [jsx('option', { value: 'a', children: 'A' }), jsx('option', { value: 'b', selected: true, children: 'B' })]), expected: '<select><option value="a">A</option><option value="b" selected>B</option></select>' },
  { id: 'formel-option-selected-false-vanishes', src: 'janux', node: () => jsx('option', { value: 'a', selected: false, children: 'A' }), expected: '<option value="a">A</option>' },
  { id: 'formel-option-value-zero-is-rendered', src: 'janux', node: () => jsx('option', { value: 0, children: 'zero' }), expected: '<option value="0">zero</option>' },
  { id: 'formel-option-label-attribute-is-escaped', src: 'janux', node: () => jsx('option', { label: 'a "b"', children: 'x' }), expected: '<option label="a &quot;b&quot;">x</option>' },
  // React moves `value` off the <select> into per-option selected; Janux keeps it.
  { id: 'formel-select-value-stays-an-attribute', src: 'janux', node: () => jsx('select', { value: 'b', children: [jsx('option', { value: 'a', children: 'A' }), jsx('option', { value: 'b', children: 'B' })] }), expected: '<select value="b"><option value="a">A</option><option value="b">B</option></select>' },
  { id: 'formel-select-multiple-with-a-numeric-size', src: 'janux', node: () => jsx('select', { multiple: true, size: 4, children: jsx('option', { children: 'A' }) }), expected: '<select multiple size="4"><option>A</option></select>' },
  { id: 'formel-optgroup-wraps-its-options', src: 'janux', node: () => jsx('optgroup', { label: 'g', disabled: true, children: jsx('option', { children: 'A' }) }), expected: '<optgroup label="g" disabled><option>A</option></optgroup>' },
  { id: 'formel-datalist-with-value-only-options', src: 'janux', node: () => jsx('datalist', { id: 'dl', children: [w('option', { value: 'a' }), w('option', { value: 'b' })] }), expected: '<datalist id="dl"><option value="a"></option><option value="b"></option></datalist>' },

  // ── forms and their markers ─────────────────────────────────────────────────
  { id: 'formel-form-with-method-and-action', src: 'janux', node: () => jsx('form', { method: 'post', action: '/save', children: 'x' }), expected: '<form method="post" action="/save">x</form>' },
  { id: 'formel-form-submit-intent-plus-reset-marker', src: 'janux', node: () => jsx('form', { onSubmit: { $intent: { component: 'signup', name: 'send' } }, reset: true, children: 'x' }), expected: '<form data-jxform="signup:send" data-jxreset="">x</form>' },
  { id: 'formel-label-for-wires-to-an-input-id', src: 'janux', node: () => jsx('p', { children: [jsx('label', { for: 'em', children: 'Email' }), jsx('input', { id: 'em', type: 'email' })] }), expected: '<p><label for="em">Email</label><input id="em" type="email"/></p>' },
  { id: 'formel-fieldset-disabled-with-legend', src: 'janux', node: () => jsx('fieldset', { disabled: true, children: kid('legend', 'Billing') }), expected: '<fieldset disabled><legend>Billing</legend></fieldset>' },
  { id: 'formel-button-with-name-and-value', src: 'janux', node: () => jsx('button', { type: 'submit', name: 'op', value: 'save', children: 'Save' }), expected: '<button type="submit" name="op" value="save">Save</button>' },
  { id: 'formel-input-numeric-range-attributes', src: 'janux', node: () => w('input', { type: 'number', min: 0, max: 10, step: 0.5 }), expected: '<input type="number" min="0" max="10" step="0.5"/>' },
  { id: 'formel-input-placeholder-escapes-its-quotes', src: 'janux', node: () => w('input', { placeholder: 'say "hi"' }), expected: '<input placeholder="say &quot;hi&quot;"/>' },
  { id: 'formel-input-pattern-keeps-regex-chars', src: 'janux', node: () => w('input', { pattern: '[A-Za-z]{3}' }), expected: '<input pattern="[A-Za-z]{3}"/>' },
  { id: 'formel-textarea-dimensions-are-numeric-attributes', src: 'janux', node: () => jsx('textarea', { rows: 4, cols: 40 }), expected: '<textarea rows="4" cols="40"></textarea>' },

  // ── output-style value elements ─────────────────────────────────────────────
  { id: 'formel-progress-value-zero-is-meaningful', src: 'janux', node: () => w('progress', { value: 0, max: 100 }), expected: '<progress value="0" max="100"></progress>' },
  { id: 'formel-progress-without-value-is-indeterminate', src: 'janux', node: () => w('progress', { max: 100 }), expected: '<progress max="100"></progress>' },
  { id: 'formel-meter-full-numeric-surface', src: 'janux', node: () => w('meter', { min: 0, max: 1, low: 0.2, high: 0.8, optimum: 0.5, value: 0.6 }), expected: '<meter min="0" max="1" low="0.2" high="0.8" optimum="0.5" value="0.6"></meter>' },
  { id: 'formel-output-for-attribute', src: 'janux', node: () => jsx('output', { for: 'a b', children: '3' }), expected: '<output for="a b">3</output>' },

  // ── disclosure elements ─────────────────────────────────────────────────────
  { id: 'formel-details-open-with-summary', src: 'janux', node: () => jsx('details', { open: true, children: kid('summary', 'More') }), expected: '<details open><summary>More</summary></details>' },
  { id: 'formel-dialog-open-renders-bare', src: 'janux', node: () => jsx('dialog', { open: true, children: 'Hi' }), expected: '<dialog open>Hi</dialog>' },
];
