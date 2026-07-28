import type { Case } from '../support/case';

/**
 * Prop → attribute serialization, one row per distinct output.
 *
 * This is the shape React's `ReactDOMServerIntegrationAttributes` suite grew
 * into over a decade, and for the same reason: every value type, every reserved
 * prop and every malformed attribute name has its own correct answer, and each
 * one is a place a server renderer has shipped a bug.
 */
export interface AttrCase {
  props: Record<string, unknown>;
  /** Exactly what `renderAttrs` must return, leading space included. */
  expected: string;
}

export type AttrRow = Case<AttrCase>;

/** A bound intent as the runtime hands it to a view. */
const intentOf = (component: string, name: string, key?: string) => ({
  $intent: { component, name, ...(key === undefined ? {} : { key }) },
});

/** The same intent after `.with(input)`: identical marker plus a bound `$input`. */
const withInput = (ref: ReturnType<typeof intentOf>, input: Record<string, unknown>) => ({ ...ref, $input: input });

export const ATTRIBUTE_CASES: AttrRow[] = [
  // ── presence and absence ────────────────────────────────────────────────────
  { id: 'attr-string-value', src: 'react:Attributes#string', props: { id: 'x' }, expected: ' id="x"' },
  { id: 'attr-empty-string-is-still-rendered', src: 'react:Attributes#empty-string', props: { id: '' }, expected: ' id=""' },
  { id: 'attr-true-renders-bare-name', src: 'react:Attributes#boolean-true', props: { hidden: true }, expected: ' hidden' },
  { id: 'attr-false-is-omitted', src: 'react:Attributes#boolean-false', props: { hidden: false }, expected: '' },
  { id: 'attr-null-is-omitted', src: 'react:Attributes#null', props: { hidden: null }, expected: '' },
  { id: 'attr-undefined-is-omitted', src: 'react:Attributes#undefined', props: { hidden: undefined }, expected: '' },
  { id: 'attr-omitted-value-does-not-leave-a-space', src: 'janux', props: { a: null, id: 'x' }, expected: ' id="x"' },

  // ── numeric values ──────────────────────────────────────────────────────────
  { id: 'attr-zero-is-rendered-not-dropped', src: 'react:Attributes#numeric-zero', props: { value: 0 }, expected: ' value="0"' },
  { id: 'attr-negative-zero-serializes-as-zero', src: 'janux', props: { value: -0 }, expected: ' value="0"' },
  { id: 'attr-negative-number', src: 'react:Attributes#negative-number', props: { value: -1 }, expected: ' value="-1"' },
  { id: 'attr-float', src: 'react:Attributes#float', props: { value: 0.5 }, expected: ' value="0.5"' },
  { id: 'attr-nan', src: 'react:Attributes#NaN', props: { value: Number.NaN }, expected: ' value="NaN"' },
  { id: 'attr-infinity', src: 'react:Attributes#Infinity', props: { value: Number.POSITIVE_INFINITY }, expected: ' value="Infinity"' },
  { id: 'attr-negative-infinity', src: 'janux', props: { value: Number.NEGATIVE_INFINITY }, expected: ' value="-Infinity"' },
  { id: 'attr-exponent-notation-survives-stringification', src: 'janux', props: { value: 1e21 }, expected: ' value="1e+21"' },
  { id: 'attr-very-small-float', src: 'janux', props: { value: 1e-7 }, expected: ' value="1e-7"' },
  { id: 'attr-bigint', src: 'janux', props: { value: 10n }, expected: ' value="10"' },

  // ── non-scalar values ───────────────────────────────────────────────────────
  { id: 'attr-empty-array-stringifies-to-empty', src: 'react:Attributes#array-value', props: { value: [] }, expected: ' value=""' },
  { id: 'attr-array-joins-with-commas', src: 'react:Attributes#array-join', props: { value: [1, 2] }, expected: ' value="1,2"' },
  { id: 'attr-plain-object-stringifies-to-object-object', src: 'react:Attributes#object-value', props: { value: {} }, expected: ' value="[object Object]"' },
  { id: 'attr-object-with-tostring-uses-it', src: 'react:Attributes#toString', props: { value: { toString: () => 'ok' } }, expected: ' value="ok"' },
  { id: 'attr-symbol-value-stringifies-safely', src: 'janux', props: { value: Symbol('s') }, expected: ' value="Symbol(s)"' },
  { id: 'attr-date-uses-its-iso-adjacent-tostring', src: 'janux', props: { value: new Date(0) }, expected: ` value="${new Date(0).toString()}"` },

  // ── escaping inside an attribute value ──────────────────────────────────────
  { id: 'attr-value-escapes-ampersand', src: 'react:Attributes#escape-amp', props: { title: 'a & b' }, expected: ' title="a &amp; b"' },
  { id: 'attr-value-escapes-double-quote', src: 'react:Attributes#escape-quote', props: { title: 'say "hi"' }, expected: ' title="say &quot;hi&quot;"' },
  { id: 'attr-value-escapes-angle-brackets', src: 'react:Attributes#escape-lt-gt', props: { title: '<b>' }, expected: ' title="&lt;b&gt;"' },
  { id: 'attr-value-leaves-single-quote-alone-inside-double-quotes', src: 'janux', props: { title: "it's" }, expected: ' title="it\'s"' },
  { id: 'attr-value-double-escapes-an-existing-entity', src: 'react:Attributes#already-escaped', props: { title: '&amp;' }, expected: ' title="&amp;amp;"' },
  { id: 'attr-value-cannot-break-out-of-the-quotes', src: 'react:Attributes#attribute-injection', props: { title: '" onload="alert(1)' }, expected: ' title="&quot; onload=&quot;alert(1)"' },
  { id: 'attr-value-keeps-a-newline', src: 'janux', props: { title: 'a\nb' }, expected: ' title="a\nb"' },
  { id: 'attr-value-keeps-a-tab', src: 'janux', props: { title: 'a\tb' }, expected: ' title="a\tb"' },
  { id: 'attr-value-keeps-a-nul-byte', src: 'janux', props: { title: 'a\u0000b' }, expected: ' title="a\u0000b"' },
  { id: 'attr-value-keeps-emoji', src: 'janux', props: { title: '👩‍💻' }, expected: ' title="👩‍💻"' },
  { id: 'attr-value-keeps-rtl-text', src: 'janux', props: { title: 'مرحبا' }, expected: ' title="مرحبا"' },
  { id: 'attr-value-keeps-a-zero-width-joiner', src: 'janux', props: { title: 'a‍b' }, expected: ' title="a‍b"' },
  { id: 'attr-value-keeps-an-unpaired-surrogate', src: 'janux', props: { title: 'a\ud800b' }, expected: ' title="a\ud800b"' },

  // ── reserved props never reach the markup ───────────────────────────────────
  { id: 'attr-children-is-not-an-attribute', src: 'react:Attributes#children', props: { children: 'x' }, expected: '' },
  { id: 'attr-key-is-not-an-attribute', src: 'react:Attributes#key', props: { key: 'x' }, expected: '' },
  { id: 'attr-dangerhtml-is-not-an-attribute', src: 'react:Attributes#dangerouslySetInnerHTML', props: { dangerHTML: '<b>' }, expected: '' },
  { id: 'attr-function-value-is-dropped', src: 'react:Attributes#function-value', props: { onClick: () => {} }, expected: '' },
  { id: 'attr-unknown-on-prop-is-dropped-as-a-function', src: 'janux', props: { onMouseOver: () => {} }, expected: '' },

  // ── class and className converge ────────────────────────────────────────────
  { id: 'attr-class-passes-through', src: 'react:Attributes#class', props: { class: 'a b' }, expected: ' class="a b"' },
  { id: 'attr-classname-becomes-class', src: 'react:Attributes#className', props: { className: 'a b' }, expected: ' class="a b"' },
  { id: 'attr-classname-escapes-its-value', src: 'janux', props: { className: 'a"b' }, expected: ' class="a&quot;b"' },
  { id: 'attr-classname-false-is-omitted', src: 'janux', props: { className: false }, expected: '' },

  // ── style ───────────────────────────────────────────────────────────────────
  { id: 'attr-style-string-passes-through', src: 'brisa:style-props-to-string#string', props: { style: 'color:red' }, expected: ' style="color:red"' },
  { id: 'attr-style-string-escapes-quotes', src: 'janux', props: { style: 'font-family:"x"' }, expected: ' style="font-family:&quot;x&quot;"' },
  { id: 'attr-style-object-becomes-css-text', src: 'react:Attributes#style-object', props: { style: { color: 'red' } }, expected: ' style="color:red"' },
  { id: 'attr-style-object-joins-declarations-with-semicolons', src: 'react:Attributes#style-multiple', props: { style: { color: 'red', margin: '0' } }, expected: ' style="color:red;margin:0"' },
  { id: 'attr-style-object-hyphenates-camelcase', src: 'react:Attributes#style-camelCase', props: { style: { backgroundColor: 'red' } }, expected: ' style="background-color:red"' },
  { id: 'attr-style-object-hyphenates-every-hump', src: 'janux', props: { style: { borderTopLeftRadius: '2px' } }, expected: ' style="border-top-left-radius:2px"' },
  { id: 'attr-style-object-keeps-custom-property-casing', src: 'react:Attributes#style-custom-property', props: { style: { '--myColor': 'red' } }, expected: ' style="--myColor:red"' },
  { id: 'attr-style-object-does-not-invent-a-unit-for-a-number', src: 'janux', props: { style: { width: 10 } }, expected: ' style="width:10"' },
  { id: 'attr-style-object-keeps-a-unitless-number-unitless', src: 'react:Attributes#style-unitless', props: { style: { lineHeight: 2 } }, expected: ' style="line-height:2"' },
  { id: 'attr-style-object-keeps-zero', src: 'janux', props: { style: { margin: 0 } }, expected: ' style="margin:0"' },
  { id: 'attr-style-object-drops-null-declarations', src: 'react:Attributes#style-null-value', props: { style: { color: null, margin: '0' } }, expected: ' style="margin:0"' },
  { id: 'attr-style-object-drops-undefined-declarations', src: 'react:Attributes#style-undefined-value', props: { style: { color: undefined, margin: '0' } }, expected: ' style="margin:0"' },
  { id: 'attr-style-object-drops-false-declarations', src: 'janux', props: { style: { color: false, margin: '0' } }, expected: ' style="margin:0"' },
  { id: 'attr-style-object-drops-empty-string-declarations', src: 'react:Attributes#style-empty-value', props: { style: { color: '', margin: '0' } }, expected: ' style="margin:0"' },
  { id: 'attr-style-empty-object-leaves-no-attribute', src: 'react:Attributes#style-empty-object', props: { style: {} }, expected: '' },
  { id: 'attr-style-object-with-only-dropped-values-leaves-no-attribute', src: 'janux', props: { style: { color: null } }, expected: '' },
  { id: 'attr-style-object-escapes-a-breakout-attempt', src: 'janux', props: { style: { color: 'red" onload="alert(1)' } }, expected: ' style="color:red&quot; onload=&quot;alert(1)"' },
  { id: 'attr-style-object-cannot-inject-via-a-property-name', src: 'janux', props: { style: { 'color;x': 'red' } }, expected: ' style="color;x:red"' },
  { id: 'attr-style-array-is-not-treated-as-a-style-object', src: 'janux', props: { style: ['a'] }, expected: ' style="a"' },

  // ── data and aria ───────────────────────────────────────────────────────────
  { id: 'attr-data-attribute', src: 'react:Attributes#data-*', props: { 'data-x': 'v' }, expected: ' data-x="v"' },
  { id: 'attr-data-attribute-numeric-value', src: 'janux', props: { 'data-count': 3 }, expected: ' data-count="3"' },
  { id: 'attr-data-attribute-true-renders-bare', src: 'janux', props: { 'data-open': true }, expected: ' data-open' },
  { id: 'attr-aria-attribute', src: 'react:Attributes#aria-*', props: { 'aria-label': 'Close' }, expected: ' aria-label="Close"' },
  { id: 'attr-aria-boolean-is-a-string-not-a-bare-name', src: 'react:Attributes#aria-boolean', props: { 'aria-hidden': 'true' }, expected: ' aria-hidden="true"' },
  { id: 'attr-role', src: 'react:Attributes#role', props: { role: 'button' }, expected: ' role="button"' },

  // ── attribute names: what is accepted, what is refused ──────────────────────
  { id: 'attr-name-camelcase-is-emitted-verbatim', src: 'janux', props: { tabIndex: 3 }, expected: ' tabIndex="3"' },
  { id: 'attr-name-with-digits', src: 'janux', props: { h1: 'x' }, expected: ' h1="x"' },
  { id: 'attr-name-with-underscore', src: 'janux', props: { a_b: 'x' }, expected: ' a_b="x"' },
  { id: 'attr-name-with-dashes', src: 'janux', props: { 'a-b-c': 'x' }, expected: ' a-b-c="x"' },
  { id: 'attr-name-starting-with-a-digit-is-refused', src: 'react:Attributes#invalid-name', props: { '2x': 'v' }, expected: '' },
  { id: 'attr-name-starting-with-a-dash-is-refused', src: 'janux', props: { '-x': 'v' }, expected: '' },
  { id: 'attr-name-starting-with-an-underscore-is-refused', src: 'janux', props: { _x: 'v' }, expected: '' },
  { id: 'attr-name-with-a-space-is-refused', src: 'react:Attributes#name-with-space', props: { 'a b': 'v' }, expected: '' },
  { id: 'attr-name-with-a-quote-cannot-inject', src: 'react:Attributes#name-injection', props: { 'a"onload=alert(1)': 'v' }, expected: '' },
  { id: 'attr-name-with-an-angle-bracket-is-refused', src: 'janux', props: { 'a<b': 'v' }, expected: '' },
  { id: 'attr-name-with-an-equals-is-refused', src: 'janux', props: { 'a=b': 'v' }, expected: '' },
  { id: 'attr-name-that-is-only-a-dot-is-refused', src: 'janux', props: { '.': 'v' }, expected: '' },
  { id: 'attr-empty-name-is-refused', src: 'janux', props: { '': 'v' }, expected: '' },
  { id: 'attr-name-with-a-colon-is-refused-so-svg-namespaces-are-dropped', src: 'janux', props: { 'xlink:href': '#a' }, expected: '' },
  { id: 'attr-name-with-a-dot-is-refused', src: 'janux', props: { 'a.b': 'v' }, expected: '' },
  { id: 'attr-name-with-a-newline-is-refused', src: 'janux', props: { 'a\nb': 'v' }, expected: '' },
  { id: 'attr-unicode-name-is-refused', src: 'janux', props: { ñ: 'v' }, expected: '' },

  // ── intents become delegation markers ───────────────────────────────────────
  { id: 'attr-onclick-intent-becomes-jxa-marker', src: 'janux', props: { onClick: intentOf('cart', 'add') }, expected: ' data-jxa="cart:add"' },
  { id: 'attr-onclick-intent-with-key-includes-the-key', src: 'janux', props: { onClick: intentOf('cart', 'add', 'main') }, expected: ' data-jxa="cart#main:add"' },
  { id: 'attr-onsubmit-intent-becomes-jxform-marker', src: 'janux', props: { onSubmit: intentOf('cart', 'checkout') }, expected: ' data-jxform="cart:checkout"' },
  { id: 'attr-on-input-becomes-its-event-marker', src: 'janux', props: { onInput: intentOf('form', 'typed') }, expected: ' data-jxe-input="form:typed"' },
  { id: 'attr-on-change-becomes-its-event-marker', src: 'janux', props: { onChange: intentOf('form', 'picked') }, expected: ' data-jxe-change="form:picked"' },
  { id: 'attr-on-keydown-becomes-its-event-marker', src: 'janux', props: { onKeyDown: intentOf('form', 'key') }, expected: ' data-jxe-keydown="form:key"' },
  { id: 'attr-on-keyup-becomes-its-event-marker', src: 'janux', props: { onKeyUp: intentOf('form', 'key') }, expected: ' data-jxe-keyup="form:key"' },
  { id: 'attr-on-focus-maps-to-focusin', src: 'janux', props: { onFocus: intentOf('form', 'focus') }, expected: ' data-jxe-focusin="form:focus"' },
  { id: 'attr-on-blur-maps-to-focusout', src: 'janux', props: { onBlur: intentOf('form', 'blur') }, expected: ' data-jxe-focusout="form:blur"' },
  { id: 'attr-on-pointerdown-becomes-its-event-marker', src: 'janux', props: { onPointerDown: intentOf('c', 'down') }, expected: ' data-jxe-pointerdown="c:down"' },
  { id: 'attr-on-pointerup-becomes-its-event-marker', src: 'janux', props: { onPointerUp: intentOf('c', 'up') }, expected: ' data-jxe-pointerup="c:up"' },
  { id: 'attr-on-doubleclick-maps-to-dblclick', src: 'janux', props: { onDoubleClick: intentOf('list', 'open') }, expected: ' data-jxe-dblclick="list:open"' },
  { id: 'attr-on-dblclick-also-maps-to-dblclick', src: 'preact:props#onDblClick', props: { onDblClick: intentOf('list', 'open') }, expected: ' data-jxe-dblclick="list:open"' },
  { id: 'attr-on-pointermove-becomes-its-event-marker', src: 'janux', props: { onPointerMove: intentOf('c', 'track') }, expected: ' data-jxe-pointermove="c:track"' },
  { id: 'attr-on-mouseenter-becomes-its-event-marker', src: 'janux', props: { onMouseEnter: intentOf('c', 'hover') }, expected: ' data-jxe-mouseenter="c:hover"' },
  { id: 'attr-event-marker-escapes-a-hostile-component-name', src: 'janux', props: { onClick: intentOf('c"x', 'add') }, expected: ' data-jxa="c&quot;x:add"' },
  { id: 'attr-alias-collision-first-event-prop-wins', src: 'janux', props: { onDoubleClick: intentOf('list', 'open'), onDblClick: intentOf('list', 'close') }, expected: ' data-jxe-dblclick="list:open"' },
  { id: 'attr-focus-alias-collision-first-wins', src: 'janux', props: { onFocus: intentOf('form', 'a'), onFocusIn: intentOf('form', 'b') }, expected: ' data-jxe-focusin="form:a"' },
  { id: 'attr-with-tojson-undefined-drops-only-the-data-input', src: 'janux', props: { onClick: withInput(intentOf('cart', 'add'), { toJSON: () => undefined } as never) }, expected: ' data-jxa="cart:add"' },

  // ── .with(): bound input rides the control's data-input ─────────────────────
  { id: 'attr-with-input-serializes-to-data-input', src: 'janux', props: { onClick: withInput(intentOf('cart', 'add'), { productId: 'p1' }) }, expected: ' data-jxa="cart:add" data-input="{&quot;productId&quot;:&quot;p1&quot;}"' },
  { id: 'attr-with-input-works-on-any-event', src: 'janux', props: { onDoubleClick: withInput(intentOf('list', 'open'), { row: 3 }) }, expected: ' data-jxe-dblclick="list:open" data-input="{&quot;row&quot;:3}"' },
  { id: 'attr-explicit-data-input-wins-over-with', src: 'janux', props: { onClick: withInput(intentOf('cart', 'add'), { productId: 'p1' }), 'data-input': '{"productId":"p9"}' }, expected: ' data-jxa="cart:add" data-input="{&quot;productId&quot;:&quot;p9&quot;}"' },
  { id: 'attr-with-unserializable-input-drops-only-the-data-input', src: 'janux', props: { onClick: withInput(intentOf('cart', 'add'), { big: 10n }) }, expected: ' data-jxa="cart:add"' },

  // ── the removed v0 binding props and the reserved on* namespace ─────────────
  { id: 'attr-removed-on-prop-is-dropped', src: 'janux', props: { on: intentOf('cart', 'add') }, expected: '' },
  { id: 'attr-removed-intent-prop-is-dropped', src: 'janux', props: { intent: intentOf('cart', 'checkout') }, expected: '' },
  { id: 'attr-on-without-intent-metadata-is-omitted', src: 'janux', props: { on: () => {} }, expected: '' },
  { id: 'attr-inline-handler-string-is-refused', src: 'janux', props: { onclick: 'alert(1)' }, expected: '' },
  { id: 'attr-event-prop-string-value-is-refused', src: 'janux', props: { onClick: 'alert(1)' }, expected: '' },
  { id: 'attr-on-prefixed-name-never-reaches-the-markup', src: 'janux', props: { onLine: 'x' }, expected: '' },

  // ── ordering and multiplicity ───────────────────────────────────────────────
  { id: 'attr-order-follows-prop-insertion-order', src: 'janux', props: { b: '1', a: '2' }, expected: ' b="1" a="2"' },
  { id: 'attr-class-keeps-its-position-when-renamed', src: 'janux', props: { id: 'x', className: 'c', title: 't' }, expected: ' id="x" class="c" title="t"' },
  { id: 'attr-later-class-wins-over-earlier-classname-by-object-key-order', src: 'janux', props: { className: 'a', class: 'b' }, expected: ' class="a" class="b"' },
];
