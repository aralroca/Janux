import type { AttrRow } from './attributes.cases';

/**
 * React's renamed props, emitted verbatim by Janux.
 *
 * React maintains a translation table (`possibleStandardNames`) that turns
 * `htmlFor` into `for`, `acceptCharset` into `accept-charset`, and so on.
 * Janux deliberately has no such table: what you write is what the markup
 * gets, and the typed JSX surface is what steers authors to the real
 * attribute names. Every row here is one migration hazard a React developer
 * will actually hit, pinned so the divergence is documented rather than
 * discovered. All rows are `src: 'janux'` — the *behaviour* is ours even
 * though the prop list is React's.
 */
export const REACT_ISM_CASES: AttrRow[] = [
  // ── renamed string props come out exactly as written ────────────────────────
  { id: 'rism-htmlfor-is-not-translated-to-for', src: 'janux', props: { htmlFor: 'field1' }, expected: ' htmlFor="field1"' },
  { id: 'rism-for-passes-through-untouched', src: 'janux', props: { for: 'field1' }, expected: ' for="field1"' },
  { id: 'rism-acceptcharset-is-not-translated', src: 'janux', props: { acceptCharset: 'utf-8' }, expected: ' acceptCharset="utf-8"' },
  { id: 'rism-accept-charset-kebab-passes-through', src: 'janux', props: { 'accept-charset': 'utf-8' }, expected: ' accept-charset="utf-8"' },
  { id: 'rism-accesskey-camel-is-not-lowercased', src: 'janux', props: { accessKey: 'k' }, expected: ' accessKey="k"' },
  { id: 'rism-autocapitalize-camel-is-not-lowercased', src: 'janux', props: { autoCapitalize: 'words' }, expected: ' autoCapitalize="words"' },
  { id: 'rism-autocomplete-camel-is-not-lowercased', src: 'janux', props: { autoComplete: 'off' }, expected: ' autoComplete="off"' },
  { id: 'rism-autocorrect-camel-is-not-lowercased', src: 'janux', props: { autoCorrect: 'on' }, expected: ' autoCorrect="on"' },
  { id: 'rism-charset-camel-is-not-lowercased', src: 'janux', props: { charSet: 'utf-8' }, expected: ' charSet="utf-8"' },
  { id: 'rism-contextmenu-camel-is-not-lowercased', src: 'janux', props: { contextMenu: 'menu1' }, expected: ' contextMenu="menu1"' },
  { id: 'rism-controlslist-camel-is-not-lowercased', src: 'janux', props: { controlsList: 'nodownload' }, expected: ' controlsList="nodownload"' },
  { id: 'rism-crossorigin-camel-is-not-lowercased', src: 'janux', props: { crossOrigin: 'anonymous' }, expected: ' crossOrigin="anonymous"' },
  { id: 'rism-datetime-camel-is-not-lowercased', src: 'janux', props: { dateTime: '2026-01-01' }, expected: ' dateTime="2026-01-01"' },
  { id: 'rism-enctype-camel-is-not-lowercased', src: 'janux', props: { encType: 'multipart/form-data' }, expected: ' encType="multipart/form-data"' },
  { id: 'rism-formenctype-camel-is-not-lowercased', src: 'janux', props: { formEncType: 'text/plain' }, expected: ' formEncType="text/plain"' },
  { id: 'rism-formmethod-camel-is-not-lowercased', src: 'janux', props: { formMethod: 'post' }, expected: ' formMethod="post"' },
  { id: 'rism-formtarget-camel-is-not-lowercased', src: 'janux', props: { formTarget: '_blank' }, expected: ' formTarget="_blank"' },
  { id: 'rism-hreflang-camel-is-not-lowercased', src: 'janux', props: { hrefLang: 'ca' }, expected: ' hrefLang="ca"' },
  { id: 'rism-httpequiv-is-not-translated', src: 'janux', props: { httpEquiv: 'refresh' }, expected: ' httpEquiv="refresh"' },
  { id: 'rism-http-equiv-kebab-passes-through', src: 'janux', props: { 'http-equiv': 'refresh' }, expected: ' http-equiv="refresh"' },
  { id: 'rism-imagesizes-camel-is-not-lowercased', src: 'janux', props: { imageSizes: '50vw' }, expected: ' imageSizes="50vw"' },
  { id: 'rism-imagesrcset-camel-is-not-lowercased', src: 'janux', props: { imageSrcSet: 'a.png 1x' }, expected: ' imageSrcSet="a.png 1x"' },
  { id: 'rism-inputmode-camel-is-not-lowercased', src: 'janux', props: { inputMode: 'numeric' }, expected: ' inputMode="numeric"' },
  { id: 'rism-enterkeyhint-camel-is-not-lowercased', src: 'janux', props: { enterKeyHint: 'done' }, expected: ' enterKeyHint="done"' },
  { id: 'rism-referrerpolicy-camel-is-not-lowercased', src: 'janux', props: { referrerPolicy: 'no-referrer' }, expected: ' referrerPolicy="no-referrer"' },
  { id: 'rism-srcdoc-camel-is-not-lowercased', src: 'janux', props: { srcDoc: '<p>x</p>' }, expected: ' srcDoc="&lt;p&gt;x&lt;/p&gt;"' },
  { id: 'rism-srclang-camel-is-not-lowercased', src: 'janux', props: { srcLang: 'en' }, expected: ' srcLang="en"' },
  { id: 'rism-srcset-camel-is-not-lowercased', src: 'janux', props: { srcSet: 'a.png 1x, b.png 2x' }, expected: ' srcSet="a.png 1x, b.png 2x"' },
  { id: 'rism-usemap-camel-is-not-lowercased', src: 'janux', props: { useMap: '#map1' }, expected: ' useMap="#map1"' },
  { id: 'rism-fetchpriority-camel-is-not-lowercased', src: 'janux', props: { fetchPriority: 'high' }, expected: ' fetchPriority="high"' },
  { id: 'rism-radiogroup-camel-is-not-lowercased', src: 'janux', props: { radioGroup: 'g1' }, expected: ' radioGroup="g1"' },
  { id: 'rism-cellpadding-camel-is-not-lowercased', src: 'janux', props: { cellPadding: '4' }, expected: ' cellPadding="4"' },
  { id: 'rism-cellspacing-camel-is-not-lowercased', src: 'janux', props: { cellSpacing: '0' }, expected: ' cellSpacing="0"' },
  { id: 'rism-frameborder-camel-is-not-lowercased', src: 'janux', props: { frameBorder: '0' }, expected: ' frameBorder="0"' },
  { id: 'rism-classid-camel-is-not-lowercased', src: 'janux', props: { classID: 'clsid' }, expected: ' classID="clsid"' },
  { id: 'rism-marginheight-camel-is-not-lowercased', src: 'janux', props: { marginHeight: '0' }, expected: ' marginHeight="0"' },
  { id: 'rism-marginwidth-camel-is-not-lowercased', src: 'janux', props: { marginWidth: '0' }, expected: ' marginWidth="0"' },
  { id: 'rism-mediagroup-camel-is-not-lowercased', src: 'janux', props: { mediaGroup: 'g' }, expected: ' mediaGroup="g"' },

  // ── renamed numeric props ───────────────────────────────────────────────────
  { id: 'rism-colspan-camel-is-not-lowercased', src: 'janux', props: { colSpan: 2 }, expected: ' colSpan="2"' },
  { id: 'rism-rowspan-camel-is-not-lowercased', src: 'janux', props: { rowSpan: 3 }, expected: ' rowSpan="3"' },
  { id: 'rism-maxlength-camel-is-not-lowercased', src: 'janux', props: { maxLength: 10 }, expected: ' maxLength="10"' },
  { id: 'rism-minlength-camel-is-not-lowercased', src: 'janux', props: { minLength: 2 }, expected: ' minLength="2"' },

  // ── renamed boolean props still get boolean treatment, under the camel name ─
  { id: 'rism-autofocus-camel-true-renders-bare-camel', src: 'janux', props: { autoFocus: true }, expected: ' autoFocus' },
  { id: 'rism-autoplay-camel-true-renders-bare-camel', src: 'janux', props: { autoPlay: true }, expected: ' autoPlay' },
  { id: 'rism-novalidate-camel-true-renders-bare-camel', src: 'janux', props: { noValidate: true }, expected: ' noValidate' },
  { id: 'rism-playsinline-camel-true-renders-bare-camel', src: 'janux', props: { playsInline: true }, expected: ' playsInline' },
  { id: 'rism-readonly-camel-true-renders-bare-camel', src: 'janux', props: { readOnly: true }, expected: ' readOnly' },
  { id: 'rism-allowfullscreen-camel-true-renders-bare-camel', src: 'janux', props: { allowFullScreen: true }, expected: ' allowFullScreen' },
  { id: 'rism-formnovalidate-camel-true-renders-bare-camel', src: 'janux', props: { formNoValidate: true }, expected: ' formNoValidate' },
  { id: 'rism-itemscope-camel-true-renders-bare-camel', src: 'janux', props: { itemScope: true }, expected: ' itemScope' },

  // ── React-only props are not special-cased either ───────────────────────────
  { id: 'rism-default-value-is-not-a-value-alias', src: 'janux', props: { defaultValue: 'x' }, expected: ' defaultValue="x"' },
  { id: 'rism-default-checked-true-renders-bare', src: 'janux', props: { defaultChecked: true }, expected: ' defaultChecked' },
  { id: 'rism-ref-is-not-reserved', src: 'janux', props: { ref: 'r1' }, expected: ' ref="r1"' },
  { id: 'rism-suppress-hydration-warning-true-renders-bare', src: 'janux', props: { suppressHydrationWarning: true }, expected: ' suppressHydrationWarning' },
  // The raw sink is `dangerHTML`; React's spelling is an ordinary (inert) prop.
  { id: 'rism-dangerously-set-inner-html-stringifies-inert', src: 'janux', props: { dangerouslySetInnerHTML: { __html: '<b>x</b>' } }, expected: ' dangerouslySetInnerHTML="[object Object]"' },
];
