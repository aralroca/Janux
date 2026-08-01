import diff from 'diff-dom-streaming';
import type { Case } from '../support/case';
import type { ScenarioCase } from '../support/scenario';

/**
 * The navigation diff: `diff(document, stream)` from diff-dom-streaming, the
 * whole-document patcher Janux's SPA navigations ride on. Chunks arrive on
 * their own macrotasks so the walker really waits on the reader between
 * siblings. Every chunk carries complete sibling subtrees — element-spanning
 * splits exercise the browser's streaming parser, which happy-dom does not
 * implement, and encoding its artifacts here would pin the wrong behaviour.
 *
 * Ported from the library's own suite (`diff-dom-streaming:index#…`): body
 * swaps that keep body attributes, keyed and id-based child matching,
 * `data-action` that must never re-register, and the head/html paths the
 * in-place morph never touches.
 */

export interface StreamDiffCase {
  /** `document.body.innerHTML` before the navigation. */
  before: string;
  /** The incoming page, split at sibling-complete boundaries. */
  chunks: string[];
  /** `document.body.innerHTML` once the diff resolves. */
  expected: string;
}

export type StreamDiffRow = Case<StreamDiffCase>;

export function chunkedStream(chunks: string[]): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve));
      }
      controller.close();
    },
  });
}

const DOC = (body: string) => `<html><head></head><body>${body}</body></html>`;

export const STREAM_DIFF_CASES: StreamDiffRow[] = [
  { id: 'stream-diff-replaces-only-the-body-content', src: 'diff-dom-streaming:index#body-replace', before: '<div>foo</div>', chunks: [DOC('<div>bar</div>')], expected: '<div>bar</div>' },
  { id: 'stream-diff-updates-one-element-and-leaves-its-sibling', src: 'diff-dom-streaming:index#one-element', before: '<p>a</p><p>b</p>', chunks: [DOC('<p>a</p><p>c</p>')], expected: '<p>a</p><p>c</p>' },
  { id: 'stream-diff-adds-changes-and-removes-attributes-in-one-node', src: 'diff-dom-streaming:index#attributes', before: '<div id="x" class="old" title="drop">t</div>', chunks: [DOC('<div id="x" class="new" lang="en">t</div>')], expected: '<div id="x" class="new" lang="en">t</div>' },
  { id: 'stream-diff-updates-a-text-node-value', src: 'diff-dom-streaming:index#nodevalue', before: '<h1>hello world</h1>', chunks: [DOC('<h1>hello janux</h1>')], expected: '<h1>hello janux</h1>' },
  { id: 'stream-diff-appends-trailing-children', src: 'diff-dom-streaming:index#children-append', before: '<ul><li>a</li></ul>', chunks: [DOC('<ul><li>a</li><li>b</li><li>c</li></ul>')], expected: '<ul><li>a</li><li>b</li><li>c</li></ul>' },
  { id: 'stream-diff-removes-trailing-children', src: 'diff-dom-streaming:index#children-remove', before: '<ul><li>a</li><li>b</li><li>c</li></ul>', chunks: [DOC('<ul><li>a</li></ul>')], expected: '<ul><li>a</li></ul>' },
  { id: 'stream-diff-reorders-keyed-children-by-the-key-attribute', src: 'diff-dom-streaming:index#key-shuffle', before: '<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>', chunks: [DOC('<ul><li key="c">c</li><li key="a">a</li><li key="b">b</li></ul>')], expected: '<ul><li key="c">c</li><li key="a">a</li><li key="b">b</li></ul>' },
  { id: 'stream-diff-removes-one-keyed-child-keeping-the-rest', src: 'diff-dom-streaming:index#key-remove2', before: '<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>', chunks: [DOC('<ul><li key="a">a</li><li key="c">c</li></ul>')], expected: '<ul><li key="a">a</li><li key="c">c</li></ul>' },
  { id: 'stream-diff-inserts-a-new-keyed-child-between-survivors', src: 'diff-dom-streaming:index#key-insert2', before: '<ul><li key="a">a</li><li key="c">c</li></ul>', chunks: [DOC('<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>')], expected: '<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>' },
  { id: 'stream-diff-moves-children-matched-by-their-id', src: 'diff-dom-streaming:index#children-id', before: '<div id="x">a</div><div id="y">b</div>', chunks: [DOC('<div id="y">b</div><div id="x">a</div>')], expected: '<div id="y">b</div><div id="x">a</div>' },
  { id: 'stream-diff-a-changed-checksum-rewrites-the-node', src: 'diff-dom-streaming:index#data-checksum', before: '<div><div class="a" data-checksum="abc">initial</div></div>', chunks: [DOC('<div><div class="b" data-checksum="efg">final</div></div>')], expected: '<div><div class="b" data-checksum="efg">final</div></div>' },
  { id: 'stream-diff-changes-a-data-attribute-value', src: 'diff-dom-streaming:index#data-attribute', before: '<div data-count="1">x</div>', chunks: [DOC('<div data-count="2">x</div>')], expected: '<div data-count="2">x</div>' },
  { id: 'stream-diff-updates-only-the-path-of-an-svg', src: 'diff-dom-streaming:index#svg-path2', before: '<svg><path d="M0 0"></path></svg>', chunks: [DOC('<svg><path d="M1 1"></path></svg>')], expected: '<svg><path d="M1 1"></path></svg>' },
  { id: 'stream-diff-patches-html-with-special-chars-intact', src: 'diff-dom-streaming:index#special-chars', before: '<p>caf&amp;e</p>', chunks: [DOC('<p>café &amp; churros</p>')], expected: '<p>café &amp; churros</p>' },
  { id: 'stream-diff-never-re-adds-a-data-action-attribute', src: 'diff-dom-streaming:index#data-action', before: '<div>foo</div>', chunks: [DOC('<div data-action="foo">foo</div>')], expected: '<div>foo</div>' },
  { id: 'stream-diff-an-identical-page-changes-nothing', src: 'diff-dom-streaming:index#no-modification', before: '<div><p>same</p></div>', chunks: [DOC('<div><p>same</p></div>')], expected: '<div><p>same</p></div>' },
  { id: 'stream-diff-updates-a-comment-and-text-mix-in-the-body', src: 'janux', before: '<!--v1--><p>a</p>tail', chunks: [DOC('<!--v2--><p>b</p>tip')], expected: '<!--v2--><p>b</p>tip' },
  { id: 'stream-diff-applies-siblings-arriving-one-chunk-each', src: 'diff-dom-streaming:index#slow-chunks', before: '<div>foo</div><div>bar</div><div>baz</div>', chunks: ['<html><head></head><body>', '<div>baz</div>', '<div>foo</div>', '<div>bar</div>', '</body></html>'], expected: '<div>baz</div><div>foo</div><div>bar</div>' },
  { id: 'stream-diff-only-the-deepest-leaf-changes-in-a-nested-tree', src: 'janux', before: '<main><section><ul><li><em>old</em></li></ul></section></main>', chunks: [DOC('<main><section><ul><li><em>new</em></li></ul></section></main>')], expected: '<main><section><ul><li><em>new</em></li></ul></section></main>' },
  { id: 'stream-diff-unwraps-a-div-wrapper-into-bare-content', src: 'diff-dom-streaming:index#body-without-wrapper', before: '<div><p>x</p></div>', chunks: [DOC('<p>x</p>')], expected: '<p>x</p>' },
  { id: 'stream-diff-replaces-a-node-whose-tag-changed', src: 'diff-dom-streaming:index#template-tag-replace', before: '<div>content</div>', chunks: [DOC('<section>content</section>')], expected: '<section>content</section>' },
  { id: 'stream-diff-empties-the-body', src: 'janux', before: '<p>going</p><p>gone</p>', chunks: [DOC('')], expected: '' },
  { id: 'stream-diff-fills-an-empty-body', src: 'janux', before: '', chunks: [DOC('<h1>arrived</h1>')], expected: '<h1>arrived</h1>' },
  { id: 'stream-diff-keyed-children-with-mixed-unkeyed-siblings', src: 'janux', before: '<ul><li>static</li><li key="a">a</li><li key="b">b</li></ul>', chunks: [DOC('<ul><li>static</li><li key="b">b</li><li key="a">a</li></ul>')], expected: '<ul><li>static</li><li key="b">b</li><li key="a">a</li></ul>' },
  { id: 'stream-diff-a-doctype-prefix-is-part-of-a-normal-page', src: 'diff-dom-streaming:index#entire-documents', before: '<p>a</p>', chunks: ['<!DOCTYPE html><html><head></head><body><p>b</p></body></html>'], expected: '<p>b</p>' },
  { id: 'stream-diff-keyed-reorder-works-inside-an-svg-namespace', src: 'diff-dom-streaming:index#key-xhtml-namespace', before: '<svg><circle key="c" r="1"></circle><rect key="r"></rect></svg>', chunks: [DOC('<svg><rect key="r"></rect><circle key="c" r="1"></circle></svg>')], expected: '<svg><rect key="r"></rect><circle key="c" r="1"></circle></svg>' },
  { id: 'stream-diff-nested-keyed-lists-reorder-independently', src: 'janux', before: '<ul key="outer"><li key="x"><ol><li key="1">1</li><li key="2">2</li></ol></li><li key="y">y</li></ul>', chunks: [DOC('<ul key="outer"><li key="y">y</li><li key="x"><ol><li key="2">2</li><li key="1">1</li></ol></li></ul>')], expected: '<ul key="outer"><li key="y">y</li><li key="x"><ol><li key="2">2</li><li key="1">1</li></ol></li></ul>' },
  { id: 'stream-diff-a-whitespace-only-text-change-is-a-change', src: 'janux', before: '<pre>a b</pre>', chunks: [DOC('<pre>a  b</pre>')], expected: '<pre>a  b</pre>' },
  { id: 'stream-diff-attrs-text-and-structure-change-in-one-navigation', src: 'janux', before: '<article class="v1"><h2>old</h2><p>body</p></article>', chunks: [DOC('<article class="v2"><h2>new</h2><p>body</p><footer>f</footer></article>')], expected: '<article class="v2"><h2>new</h2><p>body</p><footer>f</footer></article>' },
  { id: 'stream-diff-a-keyed-list-arriving-one-item-per-chunk-reorders', src: 'janux', before: '<ul><li key="a">a</li><li key="b">b</li><li key="c">c</li></ul>', chunks: ['<html><head></head><body>', '<ul><li key="c">c</li><li key="b">b</li><li key="a">a</li></ul>', '</body></html>'], expected: '<ul><li key="c">c</li><li key="b">b</li><li key="a">a</li></ul>' },
  { id: 'stream-diff-siblings-shrink-across-chunked-arrival', src: 'janux', before: '<p>one</p><p>two</p><p>three</p>', chunks: ['<html><head></head><body>', '<p>uno</p>', '</body></html>'], expected: '<p>uno</p>' },
  { id: 'stream-diff-a-janux-pending-island-arrives-with-its-fallback', src: 'janux', before: '<main><p>old page</p></main>', chunks: [DOC('<main><janux-island data-jx="slow#default" data-jx-pending=""><p>wait</p></janux-island></main>')], expected: '<main><janux-island data-jx="slow#default" data-jx-pending=""><p>wait</p></janux-island></main>' },
];

/** The identity, callback and out-of-body behaviours innerHTML cannot show. */
export const STREAM_DIFF_SCENARIOS: ScenarioCase[] = [
  {
    id: 'stream-diff-a-keyed-move-relocates-the-live-nodes',
    src: 'diff-dom-streaming:index#key-move-identity',
    run: async (log) => {
      document.body.innerHTML = '<ul><li key="a">a</li><li key="b">b</li></ul>';
      const first = document.querySelector('li[key="a"]');

      await diff(document, chunkedStream([DOC('<ul><li key="b">b</li><li key="a">a</li></ul>')]));
      log.push(`kept=${document.querySelector('li[key="a"]') === first}`);
    },
    expected: ['kept=true'],
  },
  {
    id: 'stream-diff-an-id-move-relocates-the-live-nodes',
    src: 'diff-dom-streaming:index#id-move-identity',
    run: async (log) => {
      document.body.innerHTML = '<div id="x">a</div><div id="y">b</div>';
      const x = document.getElementById('x');

      await diff(document, chunkedStream([DOC('<div id="y">b</div><div id="x">a</div>')]));
      log.push(`kept=${document.getElementById('x') === x}`);
    },
    expected: ['kept=true'],
  },
  {
    id: 'stream-diff-an-untouched-sibling-keeps-its-node-instance',
    src: 'janux',
    run: async (log) => {
      document.body.innerHTML = '<p>stable</p><span>old</span>';
      const stable = document.querySelector('p');

      await diff(document, chunkedStream([DOC('<p>stable</p><span>new</span>')]));
      log.push(`kept=${document.querySelector('p') === stable} span=${document.querySelector('span')!.textContent}`);
    },
    expected: ['kept=true span=new'],
  },
  {
    id: 'stream-diff-keeps-old-body-attributes-through-a-content-swap',
    src: 'diff-dom-streaming:index#body-attributes',
    run: async (log) => {
      document.body.setAttribute('data-theme', 'dark');
      document.body.innerHTML = '<div>foo</div>';
      await diff(document, chunkedStream([DOC('<div>bar</div>')]));
      log.push(`${document.body.getAttribute('data-theme')} ${document.body.innerHTML}`);
      document.body.removeAttribute('data-theme');
    },
    expected: ['dark <div>bar</div>'],
  },
  {
    id: 'stream-diff-replaces-the-lang-attribute-of-the-html-tag',
    src: 'diff-dom-streaming:index#html-lang',
    run: async (log) => {
      document.documentElement.setAttribute('lang', 'en');
      document.body.innerHTML = '<p>x</p>';
      await diff(document, chunkedStream(['<html lang="ca"><head></head><body><p>x</p></body></html>']));
      log.push(`${document.documentElement.getAttribute('lang')} ${document.body.innerHTML}`);
    },
    expected: ['ca <p>x</p>'],
  },
  {
    id: 'stream-diff-updates-the-title-inside-the-head',
    src: 'diff-dom-streaming:index#head-title',
    run: async (log) => {
      document.head.innerHTML = '<title>old</title>';
      document.body.innerHTML = '<p>x</p>';
      await diff(document, chunkedStream(['<html><head><title>new</title></head><body><p>x</p></body></html>']));
      log.push(document.head.innerHTML);
    },
    expected: ['<title>new</title>'],
  },
  {
    id: 'stream-diff-onnextnode-visits-incoming-nodes-in-document-order',
    src: 'diff-dom-streaming:index#foreachstreamnode',
    run: async (log) => {
      document.body.innerHTML = '<p>x</p>';
      const seen: string[] = [];

      await diff(document, chunkedStream([DOC('<p>y</p><span>z</span>')]), {
        onNextNode: (node) => seen.push(node.nodeName),
      });
      log.push(seen.join(','));
    },
    expected: ['HEAD,BODY,P,#text,SPAN'],
  },
  {
    id: 'stream-diff-an-ignored-node-is-skipped-on-both-sides',
    src: 'diff-dom-streaming:index#shouldignorenode',
    run: async (log) => {
      document.body.innerHTML = '<div>foo</div><div id="ignore">bar</div>';
      await diff(document, chunkedStream([DOC('<div>bar</div><div id="ignore">bazz!</div>')]), {
        shouldIgnoreNode: (node) => (node as Element | null)?.id === 'ignore',
      });
      log.push(document.body.innerHTML);
    },
    expected: ['<div>bar</div>'],
  },
  {
    id: 'stream-diff-a-sibling-after-an-ignored-node-still-applies',
    src: 'diff-dom-streaming:index#shouldignorenode-sibling',
    run: async (log) => {
      document.body.innerHTML = '<div><span id="ignore">skip</span><b>old</b></div>';
      await diff(document, chunkedStream([DOC('<div><span id="ignore">skip</span><b>new</b></div>')]), {
        shouldIgnoreNode: (node) => (node as Element | null)?.id === 'ignore',
      });
      log.push(document.body.innerHTML);
    },
    expected: ['<div><b>new</b></div>'],
  },
  {
    id: 'stream-diff-incoming-body-attributes-are-dropped-not-merged',
    src: 'diff-dom-streaming:index#body-attrs-incoming',
    run: async (log) => {
      // The complement of keeping the OLD attributes: what the incoming body
      // declares is ignored wholesale — theme state set by the runtime wins.
      document.body.setAttribute('data-old', '1');
      document.body.innerHTML = '<div>x</div>';
      await diff(document, chunkedStream(['<html><head></head><body class="incoming"><div>y</div></body></html>']));
      log.push(`old=${document.body.getAttribute('data-old')} class=${document.body.hasAttribute('class')}`);
      document.body.removeAttribute('data-old');
    },
    expected: ['old=1 class=false'],
  },
  {
    id: 'stream-diff-head-children-update-alongside-the-body',
    src: 'janux',
    run: async (log) => {
      document.head.innerHTML = '<title>old</title><meta name="description" content="v1">';
      document.body.innerHTML = '<p>old</p>';
      await diff(
        document,
        chunkedStream(['<html><head><title>new</title><meta name="description" content="v2"></head><body><p>new</p></body></html>']),
      );
      log.push(`${document.head.innerHTML} | ${document.body.innerHTML}`);
    },
    expected: ['<title>new</title><meta name="description" content="v2"> | <p>new</p>'],
  },
  {
    id: 'stream-diff-onnextnode-spans-every-chunk-of-a-multi-chunk-stream',
    src: 'janux',
    run: async (log) => {
      document.body.innerHTML = '<p>x</p>';
      const seen: string[] = [];

      await diff(
        document,
        chunkedStream(['<html><head></head><body>', '<p>y</p>', '<em>z</em>', '</body></html>']),
        { onNextNode: (node) => seen.push(node.nodeName) },
      );
      log.push(seen.join(','));
    },
    expected: ['HEAD,BODY,P,#text,EM'],
  },
  {
    id: 'stream-diff-back-to-back-navigations-each-apply-cleanly',
    src: 'janux',
    run: async (log) => {
      // Each navigation is its own walk with a fresh visited set — the second
      // diff must not mistake the first one's insertions for its own frontier.
      document.body.innerHTML = '<p>v1</p>';
      await diff(document, chunkedStream([DOC('<p>v2</p><aside>new</aside>')]));
      const kept = document.querySelector('p');

      await diff(document, chunkedStream([DOC('<p>v3</p>')]));
      log.push(`${document.body.innerHTML} kept=${document.querySelector('p') === kept}`);
    },
    expected: ['<p>v3</p> kept=true'],
  },
];
