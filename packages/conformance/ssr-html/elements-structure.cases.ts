import { Fragment, jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * Tree-level structure: where `key` goes, what `dangerHTML` demands before it
 * takes over, how props reach the markup around children, and what a page
 * shell looks like — no doctype, no implied `<tbody>`-style rewriting, no
 * head hoisting. Janux serializes the tree you wrote.
 */
const box = (tag: string, props: Record<string, unknown>) => jsx(tag, props);

export const STRUCTURE_CASES: TreeRow[] = [
  // ── key never reaches a plain element's markup ──────────────────────────────
  { id: 'treestruct-key-in-props-is-not-serialized', src: 'react:Elements#key-not-rendered', node: () => jsx('div', { key: 'k', children: 'x' }), expected: '<div>x</div>' },
  { id: 'treestruct-jsx-key-argument-is-not-serialized', src: 'janux', node: () => jsx('div', { children: 'x' }, 'k'), expected: '<div>x</div>' },
  { id: 'treestruct-fragment-key-argument-is-ignored', src: 'janux', node: () => jsx(Fragment, { children: 'x' }, 'k'), expected: 'x' },
  { id: 'treestruct-fragment-ignores-every-non-children-prop', src: 'janux', node: () => jsx(Fragment, { class: 'c', children: 'x' }), expected: 'x' },
  { id: 'treestruct-null-props-render-an-empty-element', src: 'janux', node: () => jsx('div', null as never), expected: '<div></div>' },

  // ── dangerHTML takes over only as a string ──────────────────────────────────
  { id: 'treestruct-dangerhtml-null-keeps-children', src: 'janux', node: () => box('div', { dangerHTML: null, children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'treestruct-dangerhtml-undefined-keeps-children', src: 'janux', node: () => box('div', { dangerHTML: undefined, children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'treestruct-dangerhtml-false-keeps-children', src: 'janux', node: () => box('div', { dangerHTML: false, children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'treestruct-dangerhtml-true-keeps-children', src: 'janux', node: () => box('div', { dangerHTML: true, children: 'kept' }), expected: '<div>kept</div>' },
  // React's `{__html}` envelope is not the Janux contract — a non-string loses.
  { id: 'treestruct-dangerhtml-react-envelope-is-refused', src: 'janux', node: () => box('div', { dangerHTML: { __html: '<b>r</b>' }, children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'treestruct-dangerhtml-array-keeps-children', src: 'janux', node: () => box('div', { dangerHTML: ['<b>'], children: 'kept' }), expected: '<div>kept</div>' },
  { id: 'treestruct-dangerhtml-whitespace-string-is-honoured', src: 'janux', node: () => box('div', { dangerHTML: ' ', children: 'lost' }), expected: '<div> </div>' },
  { id: 'treestruct-dangerhtml-entity-is-not-re-escaped', src: 'janux', node: () => box('div', { dangerHTML: '&amp;' }), expected: '<div>&amp;</div>' },
  { id: 'treestruct-dangerhtml-on-a-custom-element', src: 'janux', node: () => box('x-card', { dangerHTML: '<b>r</b>' }), expected: '<x-card><b>r</b></x-card>' },
  { id: 'treestruct-attributes-precede-dangerhtml-content', src: 'janux', node: () => box('div', { id: 'a', dangerHTML: '<b>r</b>' }), expected: '<div id="a"><b>r</b></div>' },

  // ── props order and position around children ────────────────────────────────
  { id: 'treestruct-children-position-among-props-is-irrelevant', src: 'janux', node: () => box('div', { children: 'x', id: 'a' }), expected: '<div id="a">x</div>' },
  { id: 'treestruct-attributes-at-both-nesting-levels', src: 'janux', node: () => box('a', { href: '/x', children: jsx('b', { class: 'c', children: 'y' }) }), expected: '<a href="/x"><b class="c">y</b></a>' },
  { id: 'treestruct-same-tag-nests-without-collapsing', src: 'janux', node: () => box('div', { children: box('div', { children: box('div', { children: 'x' }) }) }), expected: '<div><div><div>x</div></div></div>' },
  { id: 'treestruct-sibling-order-is-document-order', src: 'janux', node: () => box('ul', { children: [box('li', { children: '1' }), box('li', { children: '2' }), box('li', { children: '3' })] }), expected: '<ul><li>1</li><li>2</li><li>3</li></ul>' },
  { id: 'treestruct-false-between-siblings-leaves-no-gap', src: 'janux', node: () => box('div', { children: [box('i', { children: 'a' }), false, box('i', { children: 'b' })] }), expected: '<div><i>a</i><i>b</i></div>' },

  // ── components and their props ──────────────────────────────────────────────
  { id: 'treestruct-component-passes-children-through', src: 'react:Elements#children-prop', node: () => jsx(({ children }: any) => jsx('section', { children }), { children: 'x' }), expected: '<section>x</section>' },
  { id: 'treestruct-component-can-render-children-twice', src: 'janux', node: () => jsx(({ children }: any) => [children, children], { children: 'x' }), expected: 'xx' },
  { id: 'treestruct-component-default-parameter-applies', src: 'janux', node: () => jsx(({ n = 5 }: any) => jsx('i', { children: n }), {}), expected: '<i>5</i>' },
  { id: 'treestruct-component-returning-undefined-renders-nothing', src: 'janux', node: () => jsx(() => undefined, {}), expected: '' },
  { id: 'treestruct-component-returning-an-empty-fragment', src: 'janux', node: () => jsx(() => jsx(Fragment, {}), {}), expected: '' },

  // ── page shells serialize verbatim ──────────────────────────────────────────
  { id: 'treestruct-html-document-tree-gets-no-doctype', src: 'janux', node: () => box('html', { lang: 'en', children: [box('head', { children: box('title', { children: 't' }) }), box('body', { children: 'x' })] }), expected: '<html lang="en"><head><title>t</title></head><body>x</body></html>' },
  { id: 'treestruct-head-children-stay-in-written-order', src: 'janux', node: () => box('head', { children: [jsx('meta', { charset: 'utf-8' }), jsx('meta', { name: 'viewport', content: 'width=device-width' }), jsx('link', { rel: 'icon', href: '/f.ico' })] }), expected: '<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><link rel="icon" href="/f.ico"/></head>' },
  { id: 'treestruct-body-with-a-trailing-script', src: 'janux', node: () => box('body', { children: [box('main', { children: 'x' }), jsx('script', { src: '/app.js', defer: true })] }), expected: '<body><main>x</main><script src="/app.js" defer></script></body>' },
];
