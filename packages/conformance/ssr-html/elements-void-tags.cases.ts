import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * The void-element boundary and tag-name identity.
 *
 * The void list is the *current* WHATWG one: `param`, `keygen` and `menuitem`
 * were removed from the spec, so they close like any element. The check is
 * also case-sensitive on purpose — Janux emits tag names verbatim (see
 * `tree-uppercase-tag-is-emitted-verbatim`), so `BR` is a different tag from
 * `br` and gets the non-void treatment consistently.
 */
const h = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);

export const VOID_TAG_CASES: TreeRow[] = [
  // ── removed-from-spec tags are not void anymore ─────────────────────────────
  { id: 'voidx-param-is-no-longer-void', src: 'janux', node: () => jsx('param', { children: 'x' }), expected: '<param>x</param>' },
  { id: 'voidx-keygen-is-no-longer-void', src: 'janux', node: () => jsx('keygen', { children: 'x' }), expected: '<keygen>x</keygen>' },
  { id: 'voidx-menuitem-is-no-longer-void', src: 'janux', node: () => jsx('menuitem', { children: 'x' }), expected: '<menuitem>x</menuitem>' },

  // ── the void check is case-sensitive, consistent with verbatim tags ─────────
  { id: 'voidx-uppercase-br-is-not-void', src: 'janux', node: () => h('BR'), expected: '<BR></BR>' },
  { id: 'voidx-uppercase-img-is-not-void', src: 'janux', node: () => h('IMG', { src: 'a.png' }), expected: '<IMG src="a.png"></IMG>' },
  { id: 'voidx-capitalized-input-is-not-void', src: 'janux', node: () => h('Input'), expected: '<Input></Input>' },

  // ── voids with the attribute shapes that matter on them ─────────────────────
  { id: 'voidx-input-with-a-bare-boolean-attribute', src: 'react:Elements#void-boolean-attr', node: () => h('input', { type: 'checkbox', checked: true }), expected: '<input type="checkbox" checked/>' },
  { id: 'voidx-input-value-zero-is-rendered', src: 'janux', node: () => h('input', { value: 0 }), expected: '<input value="0"/>' },
  { id: 'voidx-img-empty-alt-is-rendered', src: 'janux', node: () => h('img', { src: 'a.png', alt: '' }), expected: '<img src="a.png" alt=""/>' },
  { id: 'voidx-hr-with-a-class', src: 'janux', node: () => h('hr', { class: 'rule' }), expected: '<hr class="rule"/>' },
  { id: 'voidx-input-with-an-intent-marker', src: 'janux', node: () => h('input', { onInput: { $intent: { component: 'search', name: 'typed' } } }), expected: '<input data-jxe-input="search:typed"/>' },
  { id: 'voidx-link-with-rel-and-href', src: 'janux', node: () => h('link', { rel: 'stylesheet', href: '/a.css' }), expected: '<link rel="stylesheet" href="/a.css"/>' },
  { id: 'voidx-meta-content-escapes-its-quotes', src: 'janux', node: () => h('meta', { name: 'x', content: 'say "hi"' }), expected: '<meta name="x" content="say &quot;hi&quot;"/>' },
  { id: 'voidx-base-with-href', src: 'janux', node: () => h('base', { href: '/app/' }), expected: '<base href="/app/"/>' },
  { id: 'voidx-source-with-media-query', src: 'janux', node: () => h('source', { srcset: 'b.png', media: '(min-width: 600px)' }), expected: '<source srcset="b.png" media="(min-width: 600px)"/>' },
  { id: 'voidx-track-with-a-bare-default', src: 'janux', node: () => h('track', { kind: 'captions', default: true }), expected: '<track kind="captions" default/>' },
  { id: 'voidx-area-with-shape-and-coords', src: 'janux', node: () => h('area', { shape: 'rect', coords: '0,0,10,10' }), expected: '<area shape="rect" coords="0,0,10,10"/>' },
  { id: 'voidx-col-with-a-numeric-span', src: 'janux', node: () => h('col', { span: 2 }), expected: '<col span="2"/>' },

  // ── children of a void are discarded, whatever their shape ──────────────────
  { id: 'voidx-element-child-of-a-void-is-discarded', src: 'react:Elements#void-element-child', node: () => jsx('img', { src: 'a.png', children: jsx('b', { children: 'x' }) }), expected: '<img src="a.png"/>' },
  { id: 'voidx-wbr-between-text-keeps-both-sides', src: 'janux', node: () => jsx('span', { children: ['long', h('wbr'), 'word'] }), expected: '<span>long<wbr/>word</span>' },

  // ── tag names are trusted source code, emitted verbatim ─────────────────────
  { id: 'voidx-custom-element-takes-arbitrary-attributes', src: 'janux', node: () => jsx('x-chip', { label: 'a', children: 't' }), expected: '<x-chip label="a">t</x-chip>' },
  { id: 'voidx-namespaced-tag-is-emitted-verbatim', src: 'janux', node: () => h('v:rect'), expected: '<v:rect></v:rect>' },
];
