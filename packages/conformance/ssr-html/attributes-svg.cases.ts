import type { AttrRow } from './attributes.cases';

/**
 * SVG attribute names through the same pipeline as HTML ones.
 *
 * React keeps a second translation table for SVG (`strokeWidth` →
 * `stroke-width`, `xlinkHref` → `xlink:href`); Janux again has none, and the
 * SVG spec itself is split — presentation attributes are kebab-case while
 * geometry/processing attributes are genuinely camelCase (`viewBox`). Each
 * row pins one member: the camel spelling a React porter will write (emitted
 * verbatim), the kebab spelling the spec wants (passes through), and the
 * namespaced names the one-regex gate refuses.
 */
export const SVG_ATTRIBUTE_CASES: AttrRow[] = [
  // ── spec-camelCase attributes are emitted exactly as the spec spells them ───
  { id: 'svga-viewbox-keeps-its-casing', src: 'react:SVGAttributes#viewBox', props: { viewBox: '0 0 24 24' }, expected: ' viewBox="0 0 24 24"' },
  { id: 'svga-preserveaspectratio-keeps-its-casing', src: 'react:SVGAttributes#preserveAspectRatio', props: { preserveAspectRatio: 'xMidYMid meet' }, expected: ' preserveAspectRatio="xMidYMid meet"' },
  { id: 'svga-gradientunits-keeps-its-casing', src: 'janux', props: { gradientUnits: 'userSpaceOnUse' }, expected: ' gradientUnits="userSpaceOnUse"' },
  { id: 'svga-gradienttransform-keeps-its-casing', src: 'janux', props: { gradientTransform: 'rotate(45)' }, expected: ' gradientTransform="rotate(45)"' },
  { id: 'svga-patternunits-keeps-its-casing', src: 'janux', props: { patternUnits: 'objectBoundingBox' }, expected: ' patternUnits="objectBoundingBox"' },
  { id: 'svga-patterncontentunits-keeps-its-casing', src: 'janux', props: { patternContentUnits: 'userSpaceOnUse' }, expected: ' patternContentUnits="userSpaceOnUse"' },
  { id: 'svga-clippathunits-keeps-its-casing', src: 'janux', props: { clipPathUnits: 'objectBoundingBox' }, expected: ' clipPathUnits="objectBoundingBox"' },
  { id: 'svga-markerunits-keeps-its-casing', src: 'janux', props: { markerUnits: 'strokeWidth' }, expected: ' markerUnits="strokeWidth"' },
  { id: 'svga-markerwidth-numeric', src: 'janux', props: { markerWidth: 6 }, expected: ' markerWidth="6"' },
  { id: 'svga-refx-numeric', src: 'janux', props: { refX: 3 }, expected: ' refX="3"' },
  { id: 'svga-spreadmethod-keeps-its-casing', src: 'janux', props: { spreadMethod: 'reflect' }, expected: ' spreadMethod="reflect"' },
  { id: 'svga-stddeviation-numeric', src: 'janux', props: { stdDeviation: 2.5 }, expected: ' stdDeviation="2.5"' },
  { id: 'svga-basefrequency-keeps-its-casing', src: 'janux', props: { baseFrequency: '0.05' }, expected: ' baseFrequency="0.05"' },
  { id: 'svga-numoctaves-numeric', src: 'janux', props: { numOctaves: 4 }, expected: ' numOctaves="4"' },
  { id: 'svga-textlength-numeric', src: 'janux', props: { textLength: 120 }, expected: ' textLength="120"' },
  { id: 'svga-lengthadjust-keeps-its-casing', src: 'janux', props: { lengthAdjust: 'spacingAndGlyphs' }, expected: ' lengthAdjust="spacingAndGlyphs"' },
  { id: 'svga-startoffset-percentage', src: 'janux', props: { startOffset: '25%' }, expected: ' startOffset="25%"' },
  { id: 'svga-attributename-keeps-its-casing', src: 'janux', props: { attributeName: 'opacity' }, expected: ' attributeName="opacity"' },
  { id: 'svga-repeatcount-keyword', src: 'janux', props: { repeatCount: 'indefinite' }, expected: ' repeatCount="indefinite"' },
  { id: 'svga-keytimes-list', src: 'janux', props: { keyTimes: '0;0.5;1' }, expected: ' keyTimes="0;0.5;1"' },

  // ── presentation attributes: the kebab spelling the spec wants ──────────────
  { id: 'svga-stroke-width-kebab-passes-through', src: 'react:SVGAttributes#stroke-width', props: { 'stroke-width': 2 }, expected: ' stroke-width="2"' },
  { id: 'svga-fill-rule-kebab-passes-through', src: 'janux', props: { 'fill-rule': 'evenodd' }, expected: ' fill-rule="evenodd"' },
  { id: 'svga-stroke-dasharray-kebab-passes-through', src: 'janux', props: { 'stroke-dasharray': '4 2' }, expected: ' stroke-dasharray="4 2"' },
  { id: 'svga-stop-color-kebab-passes-through', src: 'janux', props: { 'stop-color': '#ff0000' }, expected: ' stop-color="#ff0000"' },
  { id: 'svga-dominant-baseline-kebab-passes-through', src: 'janux', props: { 'dominant-baseline': 'middle' }, expected: ' dominant-baseline="middle"' },

  // ── React's camel spellings are NOT translated to kebab ─────────────────────
  { id: 'svga-strokewidth-camel-is-not-translated', src: 'janux', props: { strokeWidth: 2 }, expected: ' strokeWidth="2"' },
  { id: 'svga-strokelinecap-camel-is-not-translated', src: 'janux', props: { strokeLinecap: 'round' }, expected: ' strokeLinecap="round"' },
  { id: 'svga-strokedasharray-camel-is-not-translated', src: 'janux', props: { strokeDasharray: '4 2' }, expected: ' strokeDasharray="4 2"' },
  { id: 'svga-fillopacity-camel-is-not-translated', src: 'janux', props: { fillOpacity: 0.4 }, expected: ' fillOpacity="0.4"' },
  { id: 'svga-fillrule-camel-is-not-translated', src: 'janux', props: { fillRule: 'evenodd' }, expected: ' fillRule="evenodd"' },
  { id: 'svga-cliprule-camel-is-not-translated', src: 'janux', props: { clipRule: 'nonzero' }, expected: ' clipRule="nonzero"' },
  { id: 'svga-stopcolor-camel-is-not-translated', src: 'janux', props: { stopColor: '#00ff00' }, expected: ' stopColor="#00ff00"' },
  { id: 'svga-textanchor-camel-is-not-translated', src: 'janux', props: { textAnchor: 'middle' }, expected: ' textAnchor="middle"' },
  { id: 'svga-vectoreffect-camel-is-not-translated', src: 'janux', props: { vectorEffect: 'non-scaling-stroke' }, expected: ' vectorEffect="non-scaling-stroke"' },
  { id: 'svga-paintorder-camel-is-not-translated', src: 'janux', props: { paintOrder: 'stroke fill' }, expected: ' paintOrder="stroke fill"' },
  { id: 'svga-markerend-camel-is-not-translated', src: 'janux', props: { markerEnd: 'url(#arrow)' }, expected: ' markerEnd="url(#arrow)"' },
  { id: 'svga-floodcolor-camel-is-not-translated', src: 'janux', props: { floodColor: 'red' }, expected: ' floodColor="red"' },
  // React turns this into `xlink:href`; Janux emits the camel name (and the
  // colon spelling is refused by the name gate — see attributes.cases.ts).
  { id: 'svga-xlinkhref-camel-is-not-translated', src: 'janux', props: { xlinkHref: '#icon' }, expected: ' xlinkHref="#icon"' },

  // ── namespaced names fall to the one-regex gate ─────────────────────────────
  { id: 'svga-xml-lang-colon-name-is-refused', src: 'janux', props: { 'xml:lang': 'en' }, expected: '' },
  { id: 'svga-xmlns-xlink-colon-name-is-refused', src: 'janux', props: { 'xmlns:xlink': 'http://www.w3.org/1999/xlink' }, expected: '' },

  // ── geometry values with structure pass through escaped-only ────────────────
  { id: 'svga-path-data-with-arcs-passes-through', src: 'janux', props: { d: 'M0,0 A5,5 0 0,1 10,10 Z' }, expected: ' d="M0,0 A5,5 0 0,1 10,10 Z"' },
  { id: 'svga-points-list-passes-through', src: 'janux', props: { points: '0,0 10,5 0,10' }, expected: ' points="0,0 10,5 0,10"' },
  { id: 'svga-transform-functions-pass-through', src: 'janux', props: { transform: 'translate(10,20) scale(2)' }, expected: ' transform="translate(10,20) scale(2)"' },
];
