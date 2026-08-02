import type { AttrRow } from './attributes.cases';

/**
 * HTML boolean attributes, one row per WHATWG-listed attribute and polarity.
 *
 * Janux treats booleans uniformly — `true` renders the bare name, `false`
 * renders nothing — but each attribute in the spec's boolean list is its own
 * place a renderer has shipped a bug (React SSR famously dropped `muted`
 * because it modelled it as a property). The table pins the whole list, plus
 * the value shapes that are *not* booleans and must not get the bare-name
 * treatment: numbers, keyword strings and the XHTML `checked="checked"` idiom.
 */
export const BOOLEAN_ATTRIBUTE_CASES: AttrRow[] = [
  // ── the WHATWG boolean attribute list, true → bare name ─────────────────────
  { id: 'bool-allowfullscreen-true-renders-bare', src: 'react:attribute-behavior#allowfullscreen', props: { allowfullscreen: true }, expected: ' allowfullscreen' },
  { id: 'bool-async-true-renders-bare', src: 'react:attribute-behavior#async', props: { async: true }, expected: ' async' },
  { id: 'bool-autofocus-true-renders-bare', src: 'react:attribute-behavior#autofocus', props: { autofocus: true }, expected: ' autofocus' },
  { id: 'bool-autoplay-true-renders-bare', src: 'react:attribute-behavior#autoplay', props: { autoplay: true }, expected: ' autoplay' },
  { id: 'bool-checked-true-renders-bare', src: 'react:attribute-behavior#checked', props: { checked: true }, expected: ' checked' },
  { id: 'bool-controls-true-renders-bare', src: 'react:attribute-behavior#controls', props: { controls: true }, expected: ' controls' },
  { id: 'bool-default-true-renders-bare', src: 'react:attribute-behavior#default', props: { default: true }, expected: ' default' },
  { id: 'bool-defer-true-renders-bare', src: 'react:attribute-behavior#defer', props: { defer: true }, expected: ' defer' },
  { id: 'bool-disabled-true-renders-bare', src: 'react:attribute-behavior#disabled', props: { disabled: true }, expected: ' disabled' },
  { id: 'bool-formnovalidate-true-renders-bare', src: 'react:attribute-behavior#formnovalidate', props: { formnovalidate: true }, expected: ' formnovalidate' },
  { id: 'bool-inert-true-renders-bare', src: 'janux', props: { inert: true }, expected: ' inert' },
  { id: 'bool-ismap-true-renders-bare', src: 'react:attribute-behavior#ismap', props: { ismap: true }, expected: ' ismap' },
  { id: 'bool-itemscope-true-renders-bare', src: 'react:attribute-behavior#itemscope', props: { itemscope: true }, expected: ' itemscope' },
  { id: 'bool-loop-true-renders-bare', src: 'react:attribute-behavior#loop', props: { loop: true }, expected: ' loop' },
  { id: 'bool-multiple-true-renders-bare', src: 'react:attribute-behavior#multiple', props: { multiple: true }, expected: ' multiple' },
  // React SSR drops `muted` (it models it as a DOM property); Janux renders it.
  { id: 'bool-muted-true-renders-bare', src: 'janux', props: { muted: true }, expected: ' muted' },
  { id: 'bool-nomodule-true-renders-bare', src: 'react:attribute-behavior#nomodule', props: { nomodule: true }, expected: ' nomodule' },
  { id: 'bool-novalidate-true-renders-bare', src: 'react:attribute-behavior#novalidate', props: { novalidate: true }, expected: ' novalidate' },
  { id: 'bool-open-true-renders-bare', src: 'react:attribute-behavior#open', props: { open: true }, expected: ' open' },
  { id: 'bool-playsinline-true-renders-bare', src: 'react:attribute-behavior#playsinline', props: { playsinline: true }, expected: ' playsinline' },
  { id: 'bool-readonly-true-renders-bare', src: 'react:attribute-behavior#readonly', props: { readonly: true }, expected: ' readonly' },
  { id: 'bool-required-true-renders-bare', src: 'react:attribute-behavior#required', props: { required: true }, expected: ' required' },
  { id: 'bool-reversed-true-renders-bare', src: 'react:attribute-behavior#reversed', props: { reversed: true }, expected: ' reversed' },
  { id: 'bool-selected-true-renders-bare', src: 'react:attribute-behavior#selected', props: { selected: true }, expected: ' selected' },
  { id: 'bool-disablepictureinpicture-true-renders-bare', src: 'janux', props: { disablepictureinpicture: true }, expected: ' disablepictureinpicture' },
  { id: 'bool-disableremoteplayback-true-renders-bare', src: 'janux', props: { disableremoteplayback: true }, expected: ' disableremoteplayback' },
  { id: 'bool-shadowrootclonable-true-renders-bare', src: 'janux', props: { shadowrootclonable: true }, expected: ' shadowrootclonable' },
  { id: 'bool-shadowrootdelegatesfocus-true-renders-bare', src: 'janux', props: { shadowrootdelegatesfocus: true }, expected: ' shadowrootdelegatesfocus' },
  { id: 'bool-shadowrootserializable-true-renders-bare', src: 'janux', props: { shadowrootserializable: true }, expected: ' shadowrootserializable' },

  // ── the same list, false → nothing at all ───────────────────────────────────
  { id: 'bool-allowfullscreen-false-is-omitted', src: 'react:attribute-behavior#allowfullscreen-false', props: { allowfullscreen: false }, expected: '' },
  { id: 'bool-async-false-is-omitted', src: 'react:attribute-behavior#async-false', props: { async: false }, expected: '' },
  { id: 'bool-autofocus-false-is-omitted', src: 'react:attribute-behavior#autofocus-false', props: { autofocus: false }, expected: '' },
  { id: 'bool-autoplay-false-is-omitted', src: 'react:attribute-behavior#autoplay-false', props: { autoplay: false }, expected: '' },
  { id: 'bool-checked-false-is-omitted', src: 'react:attribute-behavior#checked-false', props: { checked: false }, expected: '' },
  { id: 'bool-controls-false-is-omitted', src: 'react:attribute-behavior#controls-false', props: { controls: false }, expected: '' },
  { id: 'bool-default-false-is-omitted', src: 'react:attribute-behavior#default-false', props: { default: false }, expected: '' },
  { id: 'bool-defer-false-is-omitted', src: 'react:attribute-behavior#defer-false', props: { defer: false }, expected: '' },
  { id: 'bool-disabled-false-is-omitted', src: 'react:attribute-behavior#disabled-false', props: { disabled: false }, expected: '' },
  { id: 'bool-formnovalidate-false-is-omitted', src: 'react:attribute-behavior#formnovalidate-false', props: { formnovalidate: false }, expected: '' },
  { id: 'bool-inert-false-is-omitted', src: 'janux', props: { inert: false }, expected: '' },
  { id: 'bool-ismap-false-is-omitted', src: 'react:attribute-behavior#ismap-false', props: { ismap: false }, expected: '' },
  { id: 'bool-itemscope-false-is-omitted', src: 'react:attribute-behavior#itemscope-false', props: { itemscope: false }, expected: '' },
  { id: 'bool-loop-false-is-omitted', src: 'react:attribute-behavior#loop-false', props: { loop: false }, expected: '' },
  { id: 'bool-multiple-false-is-omitted', src: 'react:attribute-behavior#multiple-false', props: { multiple: false }, expected: '' },
  { id: 'bool-muted-false-is-omitted', src: 'janux', props: { muted: false }, expected: '' },
  { id: 'bool-nomodule-false-is-omitted', src: 'react:attribute-behavior#nomodule-false', props: { nomodule: false }, expected: '' },
  { id: 'bool-novalidate-false-is-omitted', src: 'react:attribute-behavior#novalidate-false', props: { novalidate: false }, expected: '' },
  { id: 'bool-open-false-is-omitted', src: 'react:attribute-behavior#open-false', props: { open: false }, expected: '' },
  { id: 'bool-playsinline-false-is-omitted', src: 'react:attribute-behavior#playsinline-false', props: { playsinline: false }, expected: '' },
  { id: 'bool-readonly-false-is-omitted', src: 'react:attribute-behavior#readonly-false', props: { readonly: false }, expected: '' },
  { id: 'bool-required-false-is-omitted', src: 'react:attribute-behavior#required-false', props: { required: false }, expected: '' },
  { id: 'bool-reversed-false-is-omitted', src: 'react:attribute-behavior#reversed-false', props: { reversed: false }, expected: '' },
  { id: 'bool-selected-false-is-omitted', src: 'react:attribute-behavior#selected-false', props: { selected: false }, expected: '' },
  { id: 'bool-disablepictureinpicture-false-is-omitted', src: 'janux', props: { disablepictureinpicture: false }, expected: '' },
  { id: 'bool-disableremoteplayback-false-is-omitted', src: 'janux', props: { disableremoteplayback: false }, expected: '' },
  { id: 'bool-shadowrootclonable-false-is-omitted', src: 'janux', props: { shadowrootclonable: false }, expected: '' },
  { id: 'bool-shadowrootdelegatesfocus-false-is-omitted', src: 'janux', props: { shadowrootdelegatesfocus: false }, expected: '' },
  { id: 'bool-shadowrootserializable-false-is-omitted', src: 'janux', props: { shadowrootserializable: false }, expected: '' },

  // ── values that look boolean but are not ────────────────────────────────────
  { id: 'bool-checked-numeric-one-is-a-value-not-a-toggle', src: 'janux', props: { checked: 1 }, expected: ' checked="1"' },
  { id: 'bool-checked-numeric-zero-is-a-value-not-an-omission', src: 'janux', props: { checked: 0 }, expected: ' checked="0"' },
  { id: 'bool-checked-string-true-passes-through-quoted', src: 'react:Attributes#string-true', props: { checked: 'true' }, expected: ' checked="true"' },
  { id: 'bool-disabled-empty-string-keeps-the-empty-value', src: 'janux', props: { disabled: '' }, expected: ' disabled=""' },
  { id: 'bool-disabled-xhtml-idiom-passes-through', src: 'janux', props: { disabled: 'disabled' }, expected: ' disabled="disabled"' },
  // The classic footgun: the browser reads any present value as "on".
  { id: 'bool-disabled-string-false-is-kept-as-written', src: 'react:Attributes#string-false', props: { disabled: 'false' }, expected: ' disabled="false"' },
  { id: 'bool-hidden-until-found-keyword-passes-through', src: 'janux', props: { hidden: 'until-found' }, expected: ' hidden="until-found"' },
  { id: 'bool-download-true-renders-bare', src: 'react:attribute-behavior#download', props: { download: true }, expected: ' download' },
  { id: 'bool-download-filename-passes-through', src: 'react:attribute-behavior#download-string', props: { download: 'report.pdf' }, expected: ' download="report.pdf"' },
  { id: 'bool-download-empty-string-keeps-the-empty-value', src: 'janux', props: { download: '' }, expected: ' download=""' },
];
