import type { AttrRow } from './attributes.cases';

/**
 * Attribute-name acceptance beyond the basics, and value coercion for every
 * object shape JavaScript can hand a template.
 *
 * The name gate is one regex (`/^[a-zA-Z][\w-]*$/`) and it reaches the markup
 * unescaped, so each accepted/refused class here is a security decision as
 * much as a serialization one. Values follow `react:Attributes#object-value`:
 * anything not reserved stringifies via `String(...)`, which has a distinct
 * right answer per built-in.
 */
export const NAME_VALUE_CASES: AttrRow[] = [
  // ── names that are accepted ─────────────────────────────────────────────────
  { id: 'nameval-single-letter-name', src: 'janux', props: { p: 'v' }, expected: ' p="v"' },
  { id: 'nameval-single-uppercase-letter-name', src: 'janux', props: { A: 'v' }, expected: ' A="v"' },
  { id: 'nameval-trailing-dash-is-accepted', src: 'janux', props: { 'data-': 'v' }, expected: ' data-="v"' },
  { id: 'nameval-xmlns-is-an-ordinary-name', src: 'janux', props: { xmlns: 'http://www.w3.org/2000/svg' }, expected: ' xmlns="http://www.w3.org/2000/svg"' },
  { id: 'nameval-data-attribute-with-uppercase-keeps-its-case', src: 'janux', props: { 'data-userId': '7' }, expected: ' data-userId="7"' },
  { id: 'nameval-data-attribute-with-underscore', src: 'janux', props: { data_x: 'v' }, expected: ' data_x="v"' },

  // ── names that are refused, by character class ──────────────────────────────
  { id: 'nameval-dollar-sign-is-refused', src: 'janux', props: { a$b: 'v' }, expected: '' },
  { id: 'nameval-slash-is-refused', src: 'react:Attributes#name-with-slash', props: { 'a/b': 'v' }, expected: '' },
  { id: 'nameval-backslash-is-refused', src: 'janux', props: { 'a\\b': 'v' }, expected: '' },
  { id: 'nameval-curly-brace-is-refused', src: 'janux', props: { 'a{b': 'v' }, expected: '' },
  { id: 'nameval-tab-in-a-name-is-refused', src: 'janux', props: { 'a\tb': 'v' }, expected: '' },
  { id: 'nameval-emoji-name-is-refused', src: 'janux', props: { '🎉': 'v' }, expected: '' },

  // ── built-in objects stringify through their own toString ───────────────────
  { id: 'nameval-regexp-value-uses-its-source-form', src: 'janux', props: { pattern: /a-z/g }, expected: ' pattern="/a-z/g"' },
  { id: 'nameval-url-object-serializes-to-its-href', src: 'janux', props: { href: new URL('https://example.com/x') }, expected: ' href="https://example.com/x"' },
  { id: 'nameval-error-value-uses-its-message-form', src: 'janux', props: { title: new Error('boom') }, expected: ' title="Error: boom"' },
  { id: 'nameval-set-stringifies-to-object-set', src: 'janux', props: { value: new Set([1]) }, expected: ' value="[object Set]"' },
  { id: 'nameval-map-stringifies-to-object-map', src: 'janux', props: { value: new Map() }, expected: ' value="[object Map]"' },
  { id: 'nameval-promise-stringifies-to-object-promise', src: 'janux', props: { value: Promise.resolve(1) }, expected: ' value="[object Promise]"' },
  { id: 'nameval-class-instance-uses-its-tostring', src: 'janux', props: { value: new (class { toString() { return 'inst'; } })() }, expected: ' value="inst"' },
  // A boxed Boolean is an object, not a boolean: it never toggles, it prints.
  { id: 'nameval-boxed-boolean-false-stringifies-instead-of-vanishing', src: 'janux', props: { hidden: new Boolean(false) }, expected: ' hidden="false"' },
  { id: 'nameval-boxed-number-zero-stringifies', src: 'janux', props: { value: new Number(0) }, expected: ' value="0"' },
  { id: 'nameval-deep-array-flattens-through-commas', src: 'janux', props: { value: [1, [2, 3]] }, expected: ' value="1,2,3"' },
  { id: 'nameval-array-holes-become-empty-slots', src: 'janux', props: { value: ['a', null, 'b'] }, expected: ' value="a,,b"' },
  { id: 'nameval-max-safe-integer-keeps-every-digit', src: 'janux', props: { value: Number.MAX_SAFE_INTEGER }, expected: ' value="9007199254740991"' },

  // ── a function under a plain name is a REACTIVE BINDING ─────────────────────
  // It used to be dropped. `class={() => …}` is now the attribute-level
  // primitive (the counterpart of `<For>`'s per-row scope): the thunk defers
  // the read so the enclosing view never subscribes to it, and on the server —
  // which has no effects to hang it on — it is simply evaluated, so the markup
  // is what the client's first render will produce. Only `on*` names still
  // refuse a function, because an event must name an intent.
  { id: 'nameval-function-under-a-plain-name-is-a-binding-siblings-stay', src: 'janux', props: { title: () => 'x', id: 'k' }, expected: ' title="x" id="k"' },
  { id: 'nameval-a-binding-returning-undefined-writes-no-attribute', src: 'janux', props: { title: () => undefined, id: 'k' }, expected: ' id="k"' },
  { id: 'nameval-a-binding-returning-false-writes-no-attribute', src: 'janux', props: { hidden: () => false, id: 'k' }, expected: ' id="k"' },
  { id: 'nameval-a-binding-returning-true-writes-a-bare-attribute', src: 'janux', props: { hidden: () => true }, expected: ' hidden' },
  { id: 'nameval-a-binding-value-is-escaped-like-any-other', src: 'janux', props: { title: () => '<a>&"' }, expected: ' title="&lt;a&gt;&amp;&quot;"' },
  { id: 'nameval-a-binding-under-an-on-name-is-still-refused', src: 'janux', props: { onclick: () => 'alert(1)', id: 'k' }, expected: ' id="k"' },

  // ── value contents that must survive verbatim ───────────────────────────────
  { id: 'nameval-whitespace-only-value-is-kept', src: 'janux', props: { title: '   ' }, expected: ' title="   "' },
  { id: 'nameval-backtick-is-not-escaped', src: 'janux', props: { title: '`x`' }, expected: ' title="`x`"' },
  { id: 'nameval-equals-inside-a-value-is-kept', src: 'janux', props: { title: 'a=b' }, expected: ' title="a=b"' },
  { id: 'nameval-backslash-in-a-value-is-kept', src: 'janux', props: { title: 'a\\b' }, expected: ' title="a\\b"' },
  { id: 'nameval-line-separator-u2028-is-kept', src: 'janux', props: { title: 'a b' }, expected: ' title="a b"' },
  { id: 'nameval-percent-encoding-is-not-decoded', src: 'janux', props: { title: '%3Cscript%3E' }, expected: ' title="%3Cscript%3E"' },
  { id: 'nameval-json-payload-in-a-data-attribute-escapes-its-quotes', src: 'janux', props: { 'data-config': '{"a":1}' }, expected: ' data-config="{&quot;a&quot;:1}"' },
  { id: 'nameval-srcset-descriptors-pass-through', src: 'janux', props: { srcset: 'a.png 1x, b.png 2x' }, expected: ' srcset="a.png 1x, b.png 2x"' },
  { id: 'nameval-media-query-parens-pass-through', src: 'janux', props: { media: '(max-width: 600px)' }, expected: ' media="(max-width: 600px)"' },
  { id: 'nameval-integrity-hash-keeps-base64-chars', src: 'janux', props: { integrity: 'sha256-abc+def/ghi=' }, expected: ' integrity="sha256-abc+def/ghi="' },

  // ── newer global attributes ride the generic rules ──────────────────────────
  { id: 'nameval-popover-true-renders-bare', src: 'janux', props: { popover: true }, expected: ' popover' },
  { id: 'nameval-popover-manual-keyword', src: 'janux', props: { popover: 'manual' }, expected: ' popover="manual"' },
  { id: 'nameval-popovertarget-id', src: 'janux', props: { popovertarget: 'tip1' }, expected: ' popovertarget="tip1"' },
  { id: 'nameval-is-attribute-for-customized-built-ins', src: 'janux', props: { is: 'fancy-button' }, expected: ' is="fancy-button"' },
  { id: 'nameval-slot-assignment', src: 'janux', props: { slot: 'header' }, expected: ' slot="header"' },
  { id: 'nameval-exportparts-mapping-list', src: 'janux', props: { exportparts: 'inner:outer, label' }, expected: ' exportparts="inner:outer, label"' },

  // ── the props object itself ─────────────────────────────────────────────────
  { id: 'nameval-no-props-render-no-attributes', src: 'janux', props: {}, expected: '' },
  { id: 'nameval-frozen-props-render-fine', src: 'janux', props: Object.freeze({ id: 'f' }), expected: ' id="f"' },
];
