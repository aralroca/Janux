import type { AttrRow } from './attributes.cases';

/**
 * Enumerated attributes and the WAI-ARIA surface.
 *
 * For `contenteditable`, `draggable` and `spellcheck` an absent attribute and a
 * `"false"` token mean different things, so a boolean must land as the literal
 * string instead of the bare-name/omitted treatment. The ARIA states get the
 * same rule by prefix — every `aria-*` boolean stringifies — while everything
 * else on this page is deliberately NOT enumerated and keeps plain boolean
 * behaviour. Cases follow `react:ReactDOMServerIntegrationAttributes` and the
 * `attribute-behavior` fixture's aria matrix.
 */
export const ENUMERATED_ARIA_CASES: AttrRow[] = [
  // ── the three enumerated attributes ─────────────────────────────────────────
  { id: 'enum-contenteditable-true-stringifies', src: 'react:Attributes#contenteditable-true', props: { contenteditable: true }, expected: ' contenteditable="true"' },
  { id: 'enum-contenteditable-false-stringifies-instead-of-vanishing', src: 'react:Attributes#contenteditable-false', props: { contenteditable: false }, expected: ' contenteditable="false"' },
  { id: 'enum-contenteditable-empty-string-passes-through', src: 'janux', props: { contenteditable: '' }, expected: ' contenteditable=""' },
  { id: 'enum-contenteditable-plaintext-only-keyword', src: 'janux', props: { contenteditable: 'plaintext-only' }, expected: ' contenteditable="plaintext-only"' },
  { id: 'enum-contenteditable-string-false-passes-through', src: 'janux', props: { contenteditable: 'false' }, expected: ' contenteditable="false"' },
  // The name is matched lowercased, like the DOM does, but emitted as written.
  { id: 'enum-contenteditable-camelcase-name-still-stringifies', src: 'janux', props: { contentEditable: true }, expected: ' contentEditable="true"' },
  { id: 'enum-contenteditable-camelcase-false-still-stringifies', src: 'janux', props: { contentEditable: false }, expected: ' contentEditable="false"' },
  { id: 'enum-contenteditable-uppercase-name-still-stringifies', src: 'janux', props: { CONTENTEDITABLE: true }, expected: ' CONTENTEDITABLE="true"' },
  { id: 'enum-draggable-true-stringifies', src: 'react:Attributes#draggable-true', props: { draggable: true }, expected: ' draggable="true"' },
  { id: 'enum-draggable-false-stringifies-instead-of-vanishing', src: 'react:Attributes#draggable-false', props: { draggable: false }, expected: ' draggable="false"' },
  { id: 'enum-spellcheck-true-stringifies', src: 'react:Attributes#spellcheck-true', props: { spellcheck: true }, expected: ' spellcheck="true"' },
  { id: 'enum-spellcheck-false-stringifies-instead-of-vanishing', src: 'react:Attributes#spellcheck-false', props: { spellcheck: false }, expected: ' spellcheck="false"' },
  { id: 'enum-spellcheck-camelcase-name-still-stringifies', src: 'janux', props: { spellCheck: true }, expected: ' spellCheck="true"' },
  { id: 'enum-spellcheck-camelcase-false-still-stringifies', src: 'janux', props: { spellCheck: false }, expected: ' spellCheck="false"' },

  // ── attributes that are NOT in the enumerated set keep boolean semantics ────
  { id: 'enum-translate-false-is-omitted-not-stringified', src: 'janux', props: { translate: false }, expected: '' },
  { id: 'enum-translate-no-token-passes-through', src: 'janux', props: { translate: 'no' }, expected: ' translate="no"' },
  { id: 'enum-autocapitalize-true-renders-bare-not-stringified', src: 'janux', props: { autocapitalize: true }, expected: ' autocapitalize' },
  { id: 'enum-dir-false-is-omitted-not-stringified', src: 'janux', props: { dir: false }, expected: '' },
  { id: 'enum-dir-rtl-passes-through', src: 'janux', props: { dir: 'rtl' }, expected: ' dir="rtl"' },

  // ── aria states: booleans stringify, both polarities ────────────────────────
  { id: 'wai-aria-atomic-true', src: 'react:attribute-behavior#aria-atomic', props: { 'aria-atomic': true }, expected: ' aria-atomic="true"' },
  { id: 'wai-aria-atomic-false', src: 'react:attribute-behavior#aria-atomic-false', props: { 'aria-atomic': false }, expected: ' aria-atomic="false"' },
  { id: 'wai-aria-busy-true', src: 'react:attribute-behavior#aria-busy', props: { 'aria-busy': true }, expected: ' aria-busy="true"' },
  { id: 'wai-aria-busy-false', src: 'react:attribute-behavior#aria-busy-false', props: { 'aria-busy': false }, expected: ' aria-busy="false"' },
  { id: 'wai-aria-checked-true', src: 'react:attribute-behavior#aria-checked', props: { 'aria-checked': true }, expected: ' aria-checked="true"' },
  { id: 'wai-aria-checked-false', src: 'react:attribute-behavior#aria-checked-false', props: { 'aria-checked': false }, expected: ' aria-checked="false"' },
  { id: 'wai-aria-current-true', src: 'react:attribute-behavior#aria-current', props: { 'aria-current': true }, expected: ' aria-current="true"' },
  { id: 'wai-aria-current-false', src: 'react:attribute-behavior#aria-current-false', props: { 'aria-current': false }, expected: ' aria-current="false"' },
  { id: 'wai-aria-disabled-true', src: 'react:attribute-behavior#aria-disabled', props: { 'aria-disabled': true }, expected: ' aria-disabled="true"' },
  { id: 'wai-aria-disabled-false', src: 'react:attribute-behavior#aria-disabled-false', props: { 'aria-disabled': false }, expected: ' aria-disabled="false"' },
  { id: 'wai-aria-expanded-true', src: 'react:attribute-behavior#aria-expanded', props: { 'aria-expanded': true }, expected: ' aria-expanded="true"' },
  { id: 'wai-aria-expanded-false', src: 'react:attribute-behavior#aria-expanded-false', props: { 'aria-expanded': false }, expected: ' aria-expanded="false"' },
  { id: 'wai-aria-grabbed-true', src: 'react:attribute-behavior#aria-grabbed', props: { 'aria-grabbed': true }, expected: ' aria-grabbed="true"' },
  { id: 'wai-aria-grabbed-false', src: 'react:attribute-behavior#aria-grabbed-false', props: { 'aria-grabbed': false }, expected: ' aria-grabbed="false"' },
  { id: 'wai-aria-haspopup-true', src: 'react:attribute-behavior#aria-haspopup', props: { 'aria-haspopup': true }, expected: ' aria-haspopup="true"' },
  { id: 'wai-aria-haspopup-false', src: 'react:attribute-behavior#aria-haspopup-false', props: { 'aria-haspopup': false }, expected: ' aria-haspopup="false"' },
  { id: 'wai-aria-modal-true', src: 'react:attribute-behavior#aria-modal', props: { 'aria-modal': true }, expected: ' aria-modal="true"' },
  { id: 'wai-aria-modal-false', src: 'react:attribute-behavior#aria-modal-false', props: { 'aria-modal': false }, expected: ' aria-modal="false"' },
  { id: 'wai-aria-multiline-true', src: 'react:attribute-behavior#aria-multiline', props: { 'aria-multiline': true }, expected: ' aria-multiline="true"' },
  { id: 'wai-aria-multiline-false', src: 'react:attribute-behavior#aria-multiline-false', props: { 'aria-multiline': false }, expected: ' aria-multiline="false"' },
  { id: 'wai-aria-multiselectable-true', src: 'react:attribute-behavior#aria-multiselectable', props: { 'aria-multiselectable': true }, expected: ' aria-multiselectable="true"' },
  { id: 'wai-aria-multiselectable-false', src: 'react:attribute-behavior#aria-multiselectable-false', props: { 'aria-multiselectable': false }, expected: ' aria-multiselectable="false"' },
  { id: 'wai-aria-pressed-true', src: 'react:attribute-behavior#aria-pressed', props: { 'aria-pressed': true }, expected: ' aria-pressed="true"' },
  { id: 'wai-aria-pressed-false', src: 'react:attribute-behavior#aria-pressed-false', props: { 'aria-pressed': false }, expected: ' aria-pressed="false"' },
  { id: 'wai-aria-readonly-true', src: 'react:attribute-behavior#aria-readonly', props: { 'aria-readonly': true }, expected: ' aria-readonly="true"' },
  { id: 'wai-aria-readonly-false', src: 'react:attribute-behavior#aria-readonly-false', props: { 'aria-readonly': false }, expected: ' aria-readonly="false"' },
  { id: 'wai-aria-required-true', src: 'react:attribute-behavior#aria-required', props: { 'aria-required': true }, expected: ' aria-required="true"' },
  { id: 'wai-aria-required-false', src: 'react:attribute-behavior#aria-required-false', props: { 'aria-required': false }, expected: ' aria-required="false"' },
  { id: 'wai-aria-selected-true', src: 'react:attribute-behavior#aria-selected', props: { 'aria-selected': true }, expected: ' aria-selected="true"' },
  { id: 'wai-aria-selected-false', src: 'react:attribute-behavior#aria-selected-false', props: { 'aria-selected': false }, expected: ' aria-selected="false"' },
  { id: 'wai-aria-invalid-true', src: 'react:attribute-behavior#aria-invalid', props: { 'aria-invalid': true }, expected: ' aria-invalid="true"' },
  { id: 'wai-aria-hidden-boolean-true', src: 'react:attribute-behavior#aria-hidden', props: { 'aria-hidden': true }, expected: ' aria-hidden="true"' },
  { id: 'wai-aria-hidden-boolean-false', src: 'react:attribute-behavior#aria-hidden-false', props: { 'aria-hidden': false }, expected: ' aria-hidden="false"' },

  // ── aria tokens, numbers and strings pass through as values ─────────────────
  { id: 'wai-aria-checked-mixed-token', src: 'react:Attributes#aria-tristate', props: { 'aria-checked': 'mixed' }, expected: ' aria-checked="mixed"' },
  { id: 'wai-aria-pressed-mixed-token', src: 'janux', props: { 'aria-pressed': 'mixed' }, expected: ' aria-pressed="mixed"' },
  { id: 'wai-aria-current-page-token', src: 'janux', props: { 'aria-current': 'page' }, expected: ' aria-current="page"' },
  { id: 'wai-aria-haspopup-menu-token', src: 'janux', props: { 'aria-haspopup': 'menu' }, expected: ' aria-haspopup="menu"' },
  { id: 'wai-aria-invalid-grammar-token', src: 'janux', props: { 'aria-invalid': 'grammar' }, expected: ' aria-invalid="grammar"' },
  { id: 'wai-aria-live-polite-token', src: 'janux', props: { 'aria-live': 'polite' }, expected: ' aria-live="polite"' },
  { id: 'wai-aria-relevant-token-list', src: 'janux', props: { 'aria-relevant': 'additions text' }, expected: ' aria-relevant="additions text"' },
  { id: 'wai-aria-sort-ascending-token', src: 'janux', props: { 'aria-sort': 'ascending' }, expected: ' aria-sort="ascending"' },
  { id: 'wai-aria-orientation-vertical-token', src: 'janux', props: { 'aria-orientation': 'vertical' }, expected: ' aria-orientation="vertical"' },
  { id: 'wai-aria-autocomplete-list-token', src: 'janux', props: { 'aria-autocomplete': 'list' }, expected: ' aria-autocomplete="list"' },
  { id: 'wai-aria-level-number', src: 'react:attribute-behavior#aria-level', props: { 'aria-level': 2 }, expected: ' aria-level="2"' },
  { id: 'wai-aria-posinset-number', src: 'janux', props: { 'aria-posinset': 1 }, expected: ' aria-posinset="1"' },
  { id: 'wai-aria-setsize-minus-one-means-unknown', src: 'janux', props: { 'aria-setsize': -1 }, expected: ' aria-setsize="-1"' },
  { id: 'wai-aria-valuenow-zero-is-rendered', src: 'janux', props: { 'aria-valuenow': 0 }, expected: ' aria-valuenow="0"' },
  { id: 'wai-aria-valuemin-float', src: 'janux', props: { 'aria-valuemin': 0.5 }, expected: ' aria-valuemin="0.5"' },
  { id: 'wai-aria-valuemax-number', src: 'janux', props: { 'aria-valuemax': 100 }, expected: ' aria-valuemax="100"' },
  { id: 'wai-aria-valuetext-string', src: 'janux', props: { 'aria-valuetext': '50 percent' }, expected: ' aria-valuetext="50 percent"' },
  { id: 'wai-aria-colcount-number', src: 'janux', props: { 'aria-colcount': 4 }, expected: ' aria-colcount="4"' },
  { id: 'wai-aria-rowindex-number', src: 'janux', props: { 'aria-rowindex': 7 }, expected: ' aria-rowindex="7"' },
  { id: 'wai-aria-label-empty-string-is-still-rendered', src: 'janux', props: { 'aria-label': '' }, expected: ' aria-label=""' },
  { id: 'wai-aria-labelledby-id-list', src: 'janux', props: { 'aria-labelledby': 'title1 subtitle2' }, expected: ' aria-labelledby="title1 subtitle2"' },
  { id: 'wai-aria-activedescendant-id', src: 'janux', props: { 'aria-activedescendant': 'opt-3' }, expected: ' aria-activedescendant="opt-3"' },
  { id: 'wai-aria-keyshortcuts-string', src: 'janux', props: { 'aria-keyshortcuts': 'Control+Shift+K' }, expected: ' aria-keyshortcuts="Control+Shift+K"' },
  { id: 'wai-aria-placeholder-escapes-its-quote', src: 'janux', props: { 'aria-placeholder': 'type "here"' }, expected: ' aria-placeholder="type &quot;here&quot;"' },
  { id: 'wai-aria-controls-id-list', src: 'janux', props: { 'aria-controls': 'panel1 panel2' }, expected: ' aria-controls="panel1 panel2"' },
  { id: 'wai-aria-describedby-id', src: 'janux', props: { 'aria-describedby': 'hint1' }, expected: ' aria-describedby="hint1"' },
  { id: 'wai-aria-details-id', src: 'janux', props: { 'aria-details': 'spec1' }, expected: ' aria-details="spec1"' },
  { id: 'wai-aria-errormessage-id', src: 'janux', props: { 'aria-errormessage': 'err1' }, expected: ' aria-errormessage="err1"' },
  { id: 'wai-aria-flowto-id-list', src: 'janux', props: { 'aria-flowto': 'next1 next2' }, expected: ' aria-flowto="next1 next2"' },
  { id: 'wai-aria-owns-id-list', src: 'janux', props: { 'aria-owns': 'child1 child2' }, expected: ' aria-owns="child1 child2"' },
  { id: 'wai-aria-braillelabel-string', src: 'janux', props: { 'aria-braillelabel': 'btn' }, expected: ' aria-braillelabel="btn"' },
  { id: 'wai-aria-brailleroledescription-string', src: 'janux', props: { 'aria-brailleroledescription': 'sw' }, expected: ' aria-brailleroledescription="sw"' },
  { id: 'wai-aria-colspan-number', src: 'janux', props: { 'aria-colspan': 2 }, expected: ' aria-colspan="2"' },
  { id: 'wai-aria-rowspan-number', src: 'janux', props: { 'aria-rowspan': 3 }, expected: ' aria-rowspan="3"' },
  { id: 'wai-aria-rowcount-minus-one-means-unknown', src: 'janux', props: { 'aria-rowcount': -1 }, expected: ' aria-rowcount="-1"' },
  { id: 'wai-aria-colindex-number', src: 'janux', props: { 'aria-colindex': 5 }, expected: ' aria-colindex="5"' },
  { id: 'wai-aria-roledescription-unicode', src: 'janux', props: { 'aria-roledescription': 'diapositiva' }, expected: ' aria-roledescription="diapositiva"' },

  // ── the prefix rule, not an allowlist ───────────────────────────────────────
  { id: 'wai-unknown-aria-attribute-boolean-still-stringifies', src: 'janux', props: { 'aria-x': true }, expected: ' aria-x="true"' },
  { id: 'wai-uppercase-aria-prefix-still-stringifies', src: 'janux', props: { 'ARIA-hidden': true }, expected: ' ARIA-hidden="true"' },
  { id: 'wai-mixed-case-aria-prefix-still-stringifies', src: 'janux', props: { 'Aria-checked': false }, expected: ' Aria-checked="false"' },
  { id: 'wai-aria-expanded-null-is-omitted', src: 'janux', props: { 'aria-expanded': null }, expected: '' },

  // ── role is not aria-prefixed, so it keeps plain boolean semantics ──────────
  { id: 'wai-role-false-is-omitted-not-stringified', src: 'janux', props: { role: false }, expected: '' },
  { id: 'wai-role-empty-string-is-rendered', src: 'janux', props: { role: '' }, expected: ' role=""' },
];
