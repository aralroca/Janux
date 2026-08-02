import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * SVG and MathML trees through the HTML serializer.
 *
 * There is no namespace mode: camelCase container tags (`linearGradient`,
 * `clipPath`, `foreignObject`) are emitted verbatim, and no SVG shape is in
 * the void list — `<circle>` closes explicitly, which every HTML parser
 * accepts inside `<svg>` where self-closing is also legal. The URL guard
 * still applies inside the foreign markup, because it lives in `renderAttrs`,
 * not in any HTML-specific layer.
 */
const g = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);

export const SVG_MATHML_TREE_CASES: TreeRow[] = [
  // ── shapes close explicitly, never self-close ───────────────────────────────
  { id: 'svgt-circle-closes-explicitly', src: 'janux', node: () => g('circle', { cx: 5, cy: 5, r: 4 }), expected: '<circle cx="5" cy="5" r="4"></circle>' },
  { id: 'svgt-rect-with-numeric-geometry', src: 'janux', node: () => g('rect', { x: 0, y: 0, width: 10, height: 20 }), expected: '<rect x="0" y="0" width="10" height="20"></rect>' },
  { id: 'svgt-line-endpoints', src: 'janux', node: () => g('line', { x1: 0, y1: 0, x2: 10, y2: 10 }), expected: '<line x1="0" y1="0" x2="10" y2="10"></line>' },
  { id: 'svgt-ellipse-radii', src: 'janux', node: () => g('ellipse', { rx: 4, ry: 2 }), expected: '<ellipse rx="4" ry="2"></ellipse>' },
  { id: 'svgt-polyline-points', src: 'janux', node: () => g('polyline', { points: '0,0 5,5 10,0' }), expected: '<polyline points="0,0 5,5 10,0"></polyline>' },
  { id: 'svgt-path-with-data', src: 'janux', node: () => g('path', { d: 'M0 0L10 10Z' }), expected: '<path d="M0 0L10 10Z"></path>' },
  { id: 'svgt-stop-closes-explicitly', src: 'janux', node: () => g('stop', { offset: '50%', 'stop-color': 'red' }), expected: '<stop offset="50%" stop-color="red"></stop>' },

  // ── camelCase container tags are emitted verbatim ───────────────────────────
  { id: 'svgt-lineargradient-tag-keeps-its-casing', src: 'react:SVGElements#linearGradient', node: () => jsx('defs', { children: jsx('linearGradient', { id: 'lg', children: g('stop', { offset: '0%' }) }) }), expected: '<defs><linearGradient id="lg"><stop offset="0%"></stop></linearGradient></defs>' },
  { id: 'svgt-clippath-tag-keeps-its-casing', src: 'react:SVGElements#clipPath', node: () => jsx('clipPath', { id: 'cp', children: g('circle', { r: 1 }) }), expected: '<clipPath id="cp"><circle r="1"></circle></clipPath>' },
  { id: 'svgt-foreignobject-hosts-html-children', src: 'react:SVGElements#foreignObject', node: () => jsx('foreignObject', { children: jsx('div', { children: 'hi' }) }), expected: '<foreignObject><div>hi</div></foreignObject>' },
  { id: 'svgt-fegaussianblur-tag-keeps-its-casing', src: 'janux', node: () => jsx('filter', { id: 'f', children: g('feGaussianBlur', { stdDeviation: 2 }) }), expected: '<filter id="f"><feGaussianBlur stdDeviation="2"></feGaussianBlur></filter>' },
  { id: 'svgt-textpath-tag-keeps-its-casing', src: 'janux', node: () => jsx('text', { children: jsx('textPath', { href: '#p', children: 'along' }) }), expected: '<text><textPath href="#p">along</textPath></text>' },

  // ── a small but complete svg document ───────────────────────────────────────
  { id: 'svgt-svg-root-with-viewbox-and-a-shape', src: 'janux', node: () => jsx('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', children: g('path', { d: 'M2 2h20v20H2z' }) }), expected: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"></path></svg>' },
  { id: 'svgt-text-with-tspan-child', src: 'janux', node: () => jsx('text', { 'text-anchor': 'middle', children: jsx('tspan', { dy: 4, children: 'label' }) }), expected: '<text text-anchor="middle"><tspan dy="4">label</tspan></text>' },
  { id: 'svgt-group-transform', src: 'janux', node: () => jsx('g', { transform: 'translate(1,2)', children: g('rect', { width: 1, height: 1 }) }), expected: '<g transform="translate(1,2)"><rect width="1" height="1"></rect></g>' },

  // ── the URL guard reaches into SVG ──────────────────────────────────────────
  { id: 'svgt-use-with-a-fragment-href-is-allowed', src: 'janux', node: () => g('use', { href: '#icon' }), expected: '<use href="#icon"></use>' },
  { id: 'svgt-use-with-an-executable-href-is-blocked', src: 'janux', node: () => g('use', { href: 'javascript:alert(1)' }), expected: '<use></use>' },
  { id: 'svgt-image-xlink-href-is-refused-by-the-name-gate', src: 'janux', node: () => g('image', { 'xlink:href': 'a.png' }), expected: '<image></image>' },

  // ── mathml renders as ordinary elements ─────────────────────────────────────
  { id: 'mathml-expression-tree', src: 'janux', node: () => jsx('math', { children: jsx('mrow', { children: [jsx('mi', { children: 'x' }), jsx('mo', { children: '+' }), jsx('mn', { children: 1 })] }) }), expected: '<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>' },
  { id: 'mathml-operator-child-is-escaped', src: 'janux', node: () => jsx('mo', { children: '<' }), expected: '<mo>&lt;</mo>' },
  { id: 'mathml-msup-keeps-argument-order', src: 'janux', node: () => jsx('msup', { children: [jsx('mi', { children: 'x' }), jsx('mn', { children: 2 })] }), expected: '<msup><mi>x</mi><mn>2</mn></msup>' },
  { id: 'mathml-mfrac-numerator-then-denominator', src: 'janux', node: () => jsx('mfrac', { children: [jsx('mn', { children: 1 }), jsx('mn', { children: 2 })] }), expected: '<mfrac><mn>1</mn><mn>2</mn></mfrac>' },
  { id: 'mathml-math-with-display-attribute', src: 'janux', node: () => jsx('math', { display: 'block', children: jsx('mi', { children: 'y' }) }), expected: '<math display="block"><mi>y</mi></math>' },
  { id: 'mathml-mspace-is-not-void', src: 'janux', node: () => g('mspace', { width: '1em' }), expected: '<mspace width="1em"></mspace>' },
  { id: 'mathml-annotation-xml-tag-renders', src: 'janux', node: () => jsx('semantics', { children: jsx('annotation-xml', { encoding: 'MathML-Content', children: jsx('mi', { children: 'z' }) }) }), expected: '<semantics><annotation-xml encoding="MathML-Content"><mi>z</mi></annotation-xml></semantics>' },
];
