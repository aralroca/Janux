import type { AttrRow } from './attributes.cases';

/**
 * The `style={{…}}` object → CSS text pipeline, beyond the basics.
 *
 * Follows `react:CSSPropertyOperations` and Vue's `ssrRenderStyle`, with the
 * Janux divergences pinned as such: no unit is ever invented for a number, no
 * vendor table exists (`msTransform` hyphenates generically to `ms-transform`,
 * without React's leading dash), and value validity is the author's problem —
 * only breakouts are neutralized, by attribute-level escaping.
 */
const SYMBOL_KEY = Symbol('theme');

export const STYLE_OBJECT_CASES: AttrRow[] = [
  // ── vendor prefixes hyphenate generically ───────────────────────────────────
  { id: 'stylex-webkit-prefix-gets-a-leading-dash', src: 'react:CSSPropertyOperations#webkit', props: { style: { WebkitTransform: 'scale(2)' } }, expected: ' style="-webkit-transform:scale(2)"' },
  { id: 'stylex-webkit-multi-hump', src: 'janux', props: { style: { WebkitLineClamp: 3 } }, expected: ' style="-webkit-line-clamp:3"' },
  { id: 'stylex-moz-prefix-gets-a-leading-dash', src: 'janux', props: { style: { MozUserSelect: 'none' } }, expected: ' style="-moz-user-select:none"' },
  { id: 'stylex-o-prefix-gets-a-leading-dash', src: 'janux', props: { style: { OTransition: 'all 1s' } }, expected: ' style="-o-transition:all 1s"' },
  // React special-cases `ms` to produce `-ms-transform`; Janux hyphenates generically.
  { id: 'stylex-ms-prefix-has-no-leading-dash', src: 'janux', props: { style: { msTransform: 'scale(2)' } }, expected: ' style="ms-transform:scale(2)"' },

  // ── property name shapes ────────────────────────────────────────────────────
  { id: 'stylex-kebab-property-passes-through', src: 'vue:ssrRenderStyle#kebab', props: { style: { 'background-color': 'red' } }, expected: ' style="background-color:red"' },
  { id: 'stylex-camel-and-kebab-spellings-both-emit', src: 'janux', props: { style: { backgroundColor: 'red', 'background-color': 'blue' } }, expected: ' style="background-color:red;background-color:blue"' },
  { id: 'stylex-snake-property-is-not-transformed', src: 'janux', props: { style: { font_size: '12px' } }, expected: ' style="font_size:12px"' },
  { id: 'stylex-logical-property-hyphenates-every-hump', src: 'janux', props: { style: { marginInlineStart: '1rem' } }, expected: ' style="margin-inline-start:1rem"' },
  { id: 'stylex-declaration-order-follows-key-order', src: 'janux', props: { style: { zIndex: 1, color: 'red' } }, expected: ' style="z-index:1;color:red"' },
  // `Object.entries` never sees symbol keys, so they vanish without a warning.
  { id: 'stylex-symbol-keys-are-invisible', src: 'janux', props: { style: { [SYMBOL_KEY]: 'dark', margin: '1px' } }, expected: ' style="margin:1px"' },

  // ── custom properties keep their casing and their zero ──────────────────────
  { id: 'stylex-custom-property-numeric-zero', src: 'janux', props: { style: { '--gap': 0 } }, expected: ' style="--gap:0"' },
  { id: 'stylex-custom-property-var-reference-value', src: 'janux', props: { style: { '--Main-Color': 'var(--brand)' } }, expected: ' style="--Main-Color:var(--brand)"' },
  { id: 'stylex-custom-property-empty-string-is-dropped', src: 'janux', props: { style: { '--gap': '' } }, expected: '' },

  // ── values: functions, units and numbers ────────────────────────────────────
  { id: 'stylex-var-value-passes-through', src: 'vue:ssrRenderStyle#var', props: { style: { color: 'var(--brand, blue)' } }, expected: ' style="color:var(--brand, blue)"' },
  { id: 'stylex-calc-value-passes-through', src: 'janux', props: { style: { width: 'calc(100% - 10px)' } }, expected: ' style="width:calc(100% - 10px)"' },
  { id: 'stylex-url-value-escapes-its-quotes', src: 'janux', props: { style: { backgroundImage: 'url("a.png")' } }, expected: ' style="background-image:url(&quot;a.png&quot;)"' },
  { id: 'stylex-gradient-value-keeps-its-commas', src: 'janux', props: { style: { background: 'linear-gradient(90deg, red, blue)' } }, expected: ' style="background:linear-gradient(90deg, red, blue)"' },
  { id: 'stylex-important-passes-through', src: 'janux', props: { style: { color: 'red !important' } }, expected: ' style="color:red !important"' },
  { id: 'stylex-content-value-quotes-are-escaped', src: 'janux', props: { style: { content: '"a"' } }, expected: ' style="content:&quot;a&quot;"' },
  { id: 'stylex-aspect-ratio-keeps-its-spaces', src: 'janux', props: { style: { aspectRatio: '16 / 9' } }, expected: ' style="aspect-ratio:16 / 9"' },
  { id: 'stylex-grid-template-repeat-value', src: 'janux', props: { style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, expected: ' style="grid-template-columns:repeat(3, 1fr)"' },
  { id: 'stylex-transform-with-multiple-functions', src: 'janux', props: { style: { transform: 'translate(1px, 2px) rotate(3deg)' } }, expected: ' style="transform:translate(1px, 2px) rotate(3deg)"' },
  { id: 'stylex-opacity-float', src: 'janux', props: { style: { opacity: 0.5 } }, expected: ' style="opacity:0.5"' },
  { id: 'stylex-negative-number-value', src: 'janux', props: { style: { marginTop: -10 } }, expected: ' style="margin-top:-10"' },
  { id: 'stylex-flex-unitless-number', src: 'react:CSSPropertyOperations#unitless-flex', props: { style: { flex: 1 } }, expected: ' style="flex:1"' },
  { id: 'stylex-font-weight-unitless-number', src: 'react:CSSPropertyOperations#unitless-font-weight', props: { style: { fontWeight: 700 } }, expected: ' style="font-weight:700"' },
  { id: 'stylex-z-index-large-number', src: 'janux', props: { style: { zIndex: 2147483647 } }, expected: ' style="z-index:2147483647"' },
  { id: 'stylex-exponent-number-survives-stringification', src: 'janux', props: { style: { width: 1e21 } }, expected: ' style="width:1e+21"' },
  { id: 'stylex-nan-value-is-not-dropped', src: 'janux', props: { style: { width: Number.NaN } }, expected: ' style="width:NaN"' },
  { id: 'stylex-infinity-value-is-not-dropped', src: 'janux', props: { style: { width: Number.POSITIVE_INFINITY } }, expected: ' style="width:Infinity"' },
  { id: 'stylex-bigint-value-stringifies', src: 'janux', props: { style: { width: 10n } }, expected: ' style="width:10"' },
  { id: 'stylex-column-count-unitless-number', src: 'janux', props: { style: { columnCount: 3 } }, expected: ' style="column-count:3"' },
  { id: 'stylex-grid-row-span-value-keeps-its-slash', src: 'janux', props: { style: { gridRow: '1 / 3' } }, expected: ' style="grid-row:1 / 3"' },
  { id: 'stylex-scroll-snap-type-two-keywords', src: 'janux', props: { style: { scrollSnapType: 'x mandatory' } }, expected: ' style="scroll-snap-type:x mandatory"' },
  { id: 'stylex-contain-intrinsic-size-two-lengths', src: 'janux', props: { style: { containIntrinsicSize: '300px 200px' } }, expected: ' style="contain-intrinsic-size:300px 200px"' },
  { id: 'stylex-counter-reset-name-and-number', src: 'janux', props: { style: { counterReset: 'section 0' } }, expected: ' style="counter-reset:section 0"' },
  { id: 'stylex-will-change-property-list', src: 'janux', props: { style: { willChange: 'transform, opacity' } }, expected: ' style="will-change:transform, opacity"' },

  // ── values that are not scalars ─────────────────────────────────────────────
  { id: 'stylex-true-value-is-not-dropped', src: 'janux', props: { style: { color: true } }, expected: ' style="color:true"' },
  { id: 'stylex-array-value-joins-with-commas', src: 'janux', props: { style: { margin: [0, 'auto'] } }, expected: ' style="margin:0,auto"' },
  { id: 'stylex-nested-object-value-stringifies-to-object-object', src: 'janux', props: { style: { color: { r: 255 } } }, expected: ' style="color:[object Object]"' },
  { id: 'stylex-tostring-value-is-used', src: 'janux', props: { style: { width: { toString: () => '4px' } } }, expected: ' style="width:4px"' },

  // ── dropping and keeping, mixed ─────────────────────────────────────────────
  { id: 'stylex-dropped-declarations-do-not-leave-gaps', src: 'janux', props: { style: { border: null, color: 'red', outline: undefined, margin: 0 } }, expected: ' style="color:red;margin:0"' },
  // A Map has no enumerable string keys, so it contributes nothing — and an
  // empty declaration list must leave no attribute behind.
  { id: 'stylex-a-map-is-not-a-style-object', src: 'janux', props: { style: new Map([['color', 'red']]) }, expected: '' },

  // ── escaping inside the attribute value ─────────────────────────────────────
  { id: 'stylex-angle-brackets-in-a-value-are-escaped', src: 'janux', props: { style: { fontFamily: '</style>' } }, expected: ' style="font-family:&lt;/style&gt;"' },
  { id: 'stylex-ampersand-in-a-value-is-escaped', src: 'janux', props: { style: { backgroundImage: 'url(a&b.png)' } }, expected: ' style="background-image:url(a&amp;b.png)"' },
  { id: 'stylex-newline-in-a-value-is-kept', src: 'janux', props: { style: { gridTemplateAreas: '"a"\n"b"' } }, expected: ' style="grid-template-areas:&quot;a&quot;\n&quot;b&quot;"' },
  // Declaration structure is not policed — only breakout is (see security/escaping).
  { id: 'stylex-semicolon-in-a-value-is-kept-verbatim', src: 'janux', props: { style: { backgroundImage: 'url(a;b.png)' } }, expected: ' style="background-image:url(a;b.png)"' },

  // ── style values that are not objects at all ────────────────────────────────
  { id: 'stylex-string-with-angle-bracket-is-escaped', src: 'janux', props: { style: 'a<b' }, expected: ' style="a&lt;b"' },
  { id: 'stylex-number-value-stringifies', src: 'janux', props: { style: 0 }, expected: ' style="0"' },
  { id: 'stylex-true-renders-a-bare-style-attribute', src: 'janux', props: { style: true }, expected: ' style' },
  { id: 'stylex-false-is-omitted', src: 'janux', props: { style: false }, expected: '' },
  { id: 'stylex-null-is-omitted', src: 'janux', props: { style: null }, expected: '' },
];
