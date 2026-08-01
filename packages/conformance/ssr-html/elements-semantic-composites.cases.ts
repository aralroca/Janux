import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * Semantic element families serialized as complete idioms — the shapes real
 * pages ship, where several behaviours have to hold at once: void children
 * inside containers, numeric attributes, boolean attributes and text escaping
 * in the same subtree. One row per idiom, not per element.
 */
const n = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);

export const SEMANTIC_COMPOSITE_CASES: TreeRow[] = [
  { id: 'semel-picture-with-sources-and-img-fallback', src: 'janux', node: () => n('picture', { children: [n('source', { srcset: 'w.avif', type: 'image/avif' }), n('source', { srcset: 'w.webp', type: 'image/webp' }), n('img', { src: 'w.jpg', alt: 'w' })] }), expected: '<picture><source srcset="w.avif" type="image/avif"/><source srcset="w.webp" type="image/webp"/><img src="w.jpg" alt="w"/></picture>' },
  { id: 'semel-video-with-sources-and-a-track', src: 'janux', node: () => n('video', { controls: true, width: 640, children: [n('source', { src: 'v.webm', type: 'video/webm' }), n('track', { kind: 'subtitles', srclang: 'ca', src: 'v.vtt' }), 'Video not supported'] }), expected: '<video controls width="640"><source src="v.webm" type="video/webm"/><track kind="subtitles" srclang="ca" src="v.vtt"/>Video not supported</video>' },
  { id: 'semel-audio-with-source-and-text-fallback', src: 'janux', node: () => n('audio', { preload: 'none', children: [n('source', { src: 'a.ogg', type: 'audio/ogg' }), 'No audio'] }), expected: '<audio preload="none"><source src="a.ogg" type="audio/ogg"/>No audio</audio>' },
  { id: 'semel-image-map-composite', src: 'janux', node: () => n('p', { children: [n('img', { src: 'm.png', usemap: '#m' }), n('map', { name: 'm', children: n('area', { shape: 'circle', coords: '5,5,3', href: '/zone' }) })] }), expected: '<p><img src="m.png" usemap="#m"/><map name="m"><area shape="circle" coords="5,5,3" href="/zone"/></map></p>' },
  { id: 'semel-reversed-ordered-list-with-li-values', src: 'janux', node: () => n('ol', { reversed: true, start: 3, type: 'a', children: [n('li', { value: 3, children: 'c' }), n('li', { children: 'b' })] }), expected: '<ol reversed start="3" type="a"><li value="3">c</li><li>b</li></ol>' },
  { id: 'semel-definition-list-pairs', src: 'janux', node: () => n('dl', { children: [n('dt', { children: 'SSR' }), n('dd', { children: 'server-side rendering' })] }), expected: '<dl><dt>SSR</dt><dd>server-side rendering</dd></dl>' },
  { id: 'semel-ruby-annotation-with-fallback-parens', src: 'janux', node: () => n('ruby', { children: ['漢', n('rp', { children: '(' }), n('rt', { children: 'kan' }), n('rp', { children: ')' })] }), expected: '<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>' },
  { id: 'semel-bdo-forces-direction-over-rtl-text', src: 'janux', node: () => n('bdo', { dir: 'ltr', children: 'مرحبا' }), expected: '<bdo dir="ltr">مرحبا</bdo>' },
  { id: 'semel-time-with-machine-readable-datetime', src: 'janux', node: () => n('time', { datetime: '2026-07-31T12:00:00Z', children: 'today' }), expected: '<time datetime="2026-07-31T12:00:00Z">today</time>' },
  { id: 'semel-data-element-with-value', src: 'janux', node: () => n('data', { value: '398', children: 'Mini Ketchup' }), expected: '<data value="398">Mini Ketchup</data>' },
  { id: 'semel-edit-pair-with-cite-and-datetime', src: 'janux', node: () => n('p', { children: [n('del', { cite: '/edits/1', datetime: '2026-01-01', children: 'old' }), n('ins', { datetime: '2026-01-02', children: 'new' })] }), expected: '<p><del cite="/edits/1" datetime="2026-01-01">old</del><ins datetime="2026-01-02">new</ins></p>' },
  { id: 'semel-figure-with-caption', src: 'janux', node: () => n('figure', { children: [n('img', { src: 'f.png', alt: '' }), n('figcaption', { children: 'Fig. 1 — a & b' })] }), expected: '<figure><img src="f.png" alt=""/><figcaption>Fig. 1 — a &amp; b</figcaption></figure>' },
  // `param` closes explicitly (removed from the void list by the spec).
  { id: 'semel-object-with-param-children', src: 'janux', node: () => n('object', { type: 'application/pdf', data: '/doc.pdf', children: n('param', { name: 'page', value: '2' }) }), expected: '<object type="application/pdf" data="/doc.pdf"><param name="page" value="2"></param></object>' },
  { id: 'semel-dialog-with-method-dialog-form', src: 'janux', node: () => n('dialog', { open: true, children: n('form', { method: 'dialog', children: n('button', { children: 'OK' }) }) }), expected: '<dialog open><form method="dialog"><button>OK</button></form></dialog>' },
  { id: 'semel-template-with-named-slots', src: 'janux', node: () => n('template', { children: [n('slot', { name: 'header', children: 'fallback' }), n('slot', {})] }), expected: '<template><slot name="header">fallback</slot><slot></slot></template>' },
  { id: 'semel-iframe-sandbox-token-list', src: 'janux', node: () => n('iframe', { src: '/embed', sandbox: 'allow-scripts allow-same-origin', loading: 'lazy' }), expected: '<iframe src="/embed" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>' },
];
