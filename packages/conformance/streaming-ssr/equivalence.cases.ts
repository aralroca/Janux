import { Fragment, jsx } from 'janux';
import type { Case } from '../support/case';
import { awaited } from './harness';

/**
 * The contract the throughput work must not break: for a page with no suspense
 * boundary, the bytes a streamed render emits are *exactly* the bytes the
 * buffered render produces — same content, same document order — no matter how
 * the emission is chunked or in what order the islands' sources settle.
 *
 * Every row is a structurally distinct page: a different way through
 * `renderSiblings`' live-cursor buffering, the single-child fast path, the
 * nested-island key namespaces, or the async pause points. Chunk boundaries,
 * chunk counts and buffer sizes are deliberately NOT pinned here — only the
 * joined result and the stream/buffer agreement, which is what a reader of the
 * page actually observes.
 *
 * Islands here have async sources but no `suspense`: a suspended island is the
 * one documented place where the two flavours diverge, and it has its own file.
 */

export interface EquivalenceCase {
  /** Rebuilt per render: island keys come from a per-render sequence. */
  page: () => unknown;
  /** What both flavours must produce. */
  html: string;
}

export type EquivalenceRow = Case<EquivalenceCase>;

/** The island envelope, so a row reads as its shape and not as transcription. */
const host = (name: string, inner: string, key = 'default', flags = ''): string =>
  `<janux-island key="${name}#${key}" data-jx="${name}#${key}"${flags}>${inner}</janux-island>`;

/** An island whose body is the default `<p>{name}</p>`. */
const plain = (name: string, key = 'default'): string => host(name, `<p>${name}</p>`, key);

export const EQUIVALENCE_CASES: EquivalenceRow[] = [
  {
    id: 'stream2-eq-a-single-static-element-is-one-document',
    src: 'janux',
    page: () => jsx('main', { children: 'hi' }),
    html: '<main>hi</main>',
  },
  {
    id: 'stream2-eq-two-static-siblings-keep-document-order',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('h1', { children: 'a' }), jsx('p', { children: 'b' })] }),
    html: '<main><h1>a</h1><p>b</p></main>',
  },
  {
    id: 'stream2-eq-text-between-elements-survives-the-sibling-buffer',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('b', { children: 'a' }), 'mid', jsx('i', { children: 'z' })] }),
    html: '<main><b>a</b>mid<i>z</i></main>',
  },
  {
    id: 'stream2-eq-a-single-child-array-takes-the-no-buffer-fast-path',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('p', { children: 'only' })] }),
    html: '<main><p>only</p></main>',
  },
  {
    id: 'stream2-eq-an-array-nested-in-an-array-flattens-in-order',
    src: 'janux',
    page: () => jsx('main', { children: [[jsx('i', { children: '1' }), jsx('i', { children: '2' })], jsx('b', { children: '3' })] }),
    html: '<main><i>1</i><i>2</i><b>3</b></main>',
  },
  {
    id: 'stream2-eq-a-fragment-at-the-root-emits-only-its-children',
    src: 'janux',
    page: () => jsx(Fragment, { children: [jsx('h1', { children: 'a' }), jsx('h2', { children: 'b' })] }),
    html: '<h1>a</h1><h2>b</h2>',
  },
  {
    id: 'stream2-eq-a-fragment-among-siblings-holds-its-own-cursor-slot',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [jsx('h1', { children: 'a' }), jsx(Fragment, { children: [jsx('i', { children: 'x' }), jsx('i', { children: 'y' })] }), jsx('h2', { children: 'b' })],
      }),
    html: '<main><h1>a</h1><i>x</i><i>y</i><h2>b</h2></main>',
  },
  {
    id: 'stream2-eq-empty-children-among-siblings-emit-nothing-at-all',
    src: 'janux',
    page: () => jsx('main', { children: [null, jsx('p', { children: 'a' }), undefined, false, jsx('p', { children: 'b' }), true] }),
    html: '<main><p>a</p><p>b</p></main>',
  },
  {
    id: 'stream2-eq-numbers-and-bigints-stream-as-text-like-strings-do',
    src: 'janux',
    page: () => jsx('main', { children: [0, '/', 42, '/', 10n] }),
    html: '<main>0/42/10</main>',
  },
  {
    id: 'stream2-eq-a-void-element-between-siblings-self-closes',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('p', { children: 'a' }), jsx('br', {}), jsx('p', { children: 'b' })] }),
    html: '<main><p>a</p><br/><p>b</p></main>',
  },
  {
    id: 'stream2-eq-ten-levels-of-nesting-unwind-in-one-piece',
    src: 'janux',
    page: () => [...Array(10).keys()].reduce<unknown>((inner) => jsx('div', { children: inner }), 'deep'),
    html: `${'<div>'.repeat(10)}deep${'</div>'.repeat(10)}`,
  },
  {
    id: 'stream2-eq-adjacent-text-children-are-not-separated',
    src: 'janux',
    page: () => jsx('p', { children: ['a', 'b', 'c'] }),
    html: '<p>abc</p>',
  },
  {
    id: 'stream2-eq-an-empty-array-of-children-leaves-an-empty-element',
    src: 'janux',
    page: () => jsx('main', { children: [] }),
    html: '<main></main>',
  },
  {
    id: 'stream2-eq-an-element-with-only-attributes-streams-attributes-first',
    src: 'janux',
    page: () => jsx('main', { id: 'root', class: 'page' }),
    html: '<main id="root" class="page"></main>',
  },
  {
    id: 'stream2-eq-danger-html-replaces-the-children-verbatim',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('div', { dangerHTML: '<i>raw</i>' }), jsx('p', { children: 'after' })] }),
    html: '<main><div><i>raw</i></div><p>after</p></main>',
  },
  {
    id: 'stream2-eq-fifty-static-children-join-into-the-same-document',
    src: 'janux',
    page: () => jsx('ul', { children: [...Array(50).keys()].map((n) => jsx('li', { children: n })) }),
    html: `<ul>${[...Array(50).keys()].map((n) => `<li>${n}</li>`).join('')}</ul>`,
  },
  {
    id: 'stream2-eq-a-lone-async-island-is-the-whole-document',
    src: 'janux',
    page: () => jsx(awaited('eq-lone', 3) as any, {}),
    html: plain('eq-lone'),
  },
  {
    id: 'stream2-eq-an-async-island-first-holds-the-cursor-for-its-siblings',
    src: 'janux',
    page: () => jsx('main', { children: [jsx(awaited('eq-first', 6) as any, {}), jsx('h1', { children: 'b' }), jsx('h2', { children: 'c' })] }),
    html: `<main>${plain('eq-first')}<h1>b</h1><h2>c</h2></main>`,
  },
  {
    id: 'stream2-eq-an-async-island-in-the-middle-does-not-reorder-its-neighbours',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('h1', { children: 'a' }), jsx(awaited('eq-mid', 6) as any, {}), jsx('h2', { children: 'c' })] }),
    html: `<main><h1>a</h1>${plain('eq-mid')}<h2>c</h2></main>`,
  },
  {
    id: 'stream2-eq-an-async-island-last-still-closes-its-parent',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('h1', { children: 'a' }), jsx('h2', { children: 'b' }), jsx(awaited('eq-last', 6) as any, {})] }),
    html: `<main><h1>a</h1><h2>b</h2>${plain('eq-last')}</main>`,
  },
  {
    id: 'stream2-eq-the-later-island-settling-first-does-not-move-it-forward',
    src: 'janux',
    page: () => jsx('main', { children: [jsx(awaited('eq-slow', 12) as any, {}), jsx(awaited('eq-fast', 1) as any, {})] }),
    html: `<main>${plain('eq-slow')}${plain('eq-fast')}</main>`,
  },
  {
    id: 'stream2-eq-three-islands-settling-in-reverse-still-read-in-document-order',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [jsx(awaited('eq-r1', 14) as any, {}), jsx(awaited('eq-r2', 8) as any, {}), jsx(awaited('eq-r3', 2) as any, {})],
      }),
    html: `<main>${plain('eq-r1')}${plain('eq-r2')}${plain('eq-r3')}</main>`,
  },
  {
    id: 'stream2-eq-a-fast-island-between-two-slow-ones-waits-its-turn',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [jsx(awaited('eq-s1', 10) as any, {}), jsx(awaited('eq-quick', 1) as any, {}), jsx(awaited('eq-s2', 10) as any, {})],
      }),
    html: `<main>${plain('eq-s1')}${plain('eq-quick')}${plain('eq-s2')}</main>`,
  },
  {
    id: 'stream2-eq-two-islands-of-the-same-module-take-default-and-n2',
    src: 'janux',
    page: () => {
      const def = awaited('eq-twin', 3);

      return jsx('main', { children: [jsx(def as any, {}), jsx(def as any, {})] });
    },
    html: `<main>${plain('eq-twin')}${plain('eq-twin', 'n2')}</main>`,
  },
  {
    id: 'stream2-eq-an-explicit-key-replaces-the-sequence-number',
    src: 'janux',
    page: () => jsx('main', { children: jsx(awaited('eq-keyed', 3) as any, { key: 'cart' }) }),
    html: `<main>${plain('eq-keyed', 'cart')}</main>`,
  },
  {
    id: 'stream2-eq-two-siblings-sharing-an-explicit-key-are-deduped-deterministically',
    src: 'janux',
    page: () => {
      const def = awaited('eq-dup', 3);

      return jsx('main', { children: [jsx(def as any, { key: 'k' }), jsx(def as any, { key: 'k' })] });
    },
    html: `<main>${plain('eq-dup', 'k')}${plain('eq-dup', 'k~2')}</main>`,
  },
  {
    id: 'stream2-eq-a-persist-island-carries-its-marker-through-the-stream',
    src: 'janux',
    page: () => jsx(awaited('eq-persist', 3) as any, { persist: true }),
    html: host('eq-persist', '<p>eq-persist</p>', 'default', ' data-jx-persist'),
  },
  {
    id: 'stream2-eq-an-eager-island-carries-its-marker-through-the-stream',
    src: 'janux',
    page: () => jsx(awaited('eq-eager', 3) as any, { eager: true }),
    html: host('eq-eager', '<p>eq-eager</p>', 'default', ' data-jx-eager'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-an-array-streams-every-node',
    src: 'janux',
    page: () => jsx(awaited('eq-arr', 3, () => [jsx('i', { children: 'x' }), jsx('i', { children: 'y' })]) as any, {}),
    html: host('eq-arr', '<i>x</i><i>y</i>'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-null-leaves-an-empty-host',
    src: 'janux',
    page: () => jsx(awaited('eq-null', 3, () => null) as any, {}),
    html: host('eq-null', ''),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-a-string-streams-escaped-text',
    src: 'janux',
    page: () => jsx(awaited('eq-text', 3, () => 'a < b') as any, {}),
    html: host('eq-text', 'a &lt; b'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-a-fragment-flattens-into-the-host',
    src: 'janux',
    page: () => jsx(awaited('eq-frag', 3, () => jsx(Fragment, { children: [jsx('b', { children: 'p' }), jsx('b', { children: 'q' })] })) as any, {}),
    html: host('eq-frag', '<b>p</b><b>q</b>'),
  },
  {
    id: 'stream2-eq-a-nested-island-is-keyed-under-its-parent',
    src: 'janux',
    page: () => {
      const child = awaited('eq-child', 2);

      return jsx(awaited('eq-parent', 4, () => jsx(child as any, {})) as any, {});
    },
    html: host('eq-parent', host('eq-child', '<p>eq-child</p>', 'eq-parent.default.1')),
  },
  {
    id: 'stream2-eq-three-island-levels-namespace-each-key-under-the-one-above',
    src: 'janux',
    page: () => {
      const leaf = awaited('eq-leaf', 1);
      const mid = awaited('eq-mid2', 2, () => jsx(leaf as any, {}));

      return jsx(awaited('eq-top', 3, () => jsx(mid as any, {})) as any, {});
    },
    html: host(
      'eq-top',
      host('eq-mid2', host('eq-leaf', '<p>eq-leaf</p>', 'eq-mid2.eq-top.default.1.1'), 'eq-top.default.1'),
    ),
  },
  {
    id: 'stream2-eq-two-nested-islands-take-sequential-keys-inside-the-parent',
    src: 'janux',
    page: () => {
      const a = awaited('eq-na', 1);
      const b = awaited('eq-nb', 1);

      return jsx(awaited('eq-nhost', 3, () => [jsx(a as any, {}), jsx(b as any, {})]) as any, {});
    },
    html: host(
      'eq-nhost',
      `${host('eq-na', '<p>eq-na</p>', 'eq-nhost.default.1')}${host('eq-nb', '<p>eq-nb</p>', 'eq-nhost.default.1')}`,
    ),
  },
  {
    id: 'stream2-eq-an-island-deep-inside-static-markup-holds-back-only-its-own-subtree',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: jsx('section', { children: jsx('div', { children: [jsx('h1', { children: 'a' }), jsx(awaited('eq-deep', 5) as any, {})] }) }),
      }),
    html: `<main><section><div><h1>a</h1>${plain('eq-deep')}</div></section></main>`,
  },
  {
    id: 'stream2-eq-a-list-of-five-islands-streams-in-index-order',
    src: 'janux',
    page: () => {
      const def = awaited('eq-row', 2);

      return jsx('ul', { children: [...Array(5).keys()].map((n) => jsx('li', { children: jsx(def as any, { key: `r${n}` }) })) });
    },
    html: `<ul>${[...Array(5).keys()].map((n) => `<li>${plain('eq-row', `r${n}`)}</li>`).join('')}</ul>`,
  },
  {
    id: 'stream2-eq-an-island-inside-a-table-row-keeps-the-table-well-formed',
    src: 'janux',
    page: () =>
      jsx('table', {
        children: jsx('tbody', { children: jsx('tr', { children: [jsx('td', { children: 'a' }), jsx('td', { children: jsx(awaited('eq-cell', 4) as any, {}) })] }) }),
      }),
    html: `<table><tbody><tr><td>a</td><td>${plain('eq-cell')}</td></tr></tbody></table>`,
  },
  {
    id: 'stream2-eq-an-island-inside-an-svg-subtree-streams-with-its-neighbours',
    src: 'janux',
    page: () => jsx('svg', { viewBox: '0 0 1 1', children: [jsx('rect', { x: '0' }), jsx('foreignObject', { children: jsx(awaited('eq-svg', 3) as any, {}) })] }),
    html: `<svg viewBox="0 0 1 1"><rect x="0"></rect><foreignObject>${plain('eq-svg')}</foreignObject></svg>`,
  },
  {
    id: 'stream2-eq-a-plain-function-component-inlines-with-no-island-host',
    src: 'janux',
    page: () => {
      const Header = (props: any) => jsx('h1', { children: props.title });

      return jsx('main', { children: [jsx(Header as any, { title: 'shop' }), jsx(awaited('eq-fn', 3) as any, {})] });
    },
    html: `<main><h1>shop</h1>${plain('eq-fn')}</main>`,
  },
  {
    id: 'stream2-eq-a-conditional-false-branch-costs-no-bytes-either-way',
    src: 'janux',
    page: () => jsx('main', { children: [false && jsx('p', { children: 'hidden' }), jsx(awaited('eq-cond', 3) as any, {})] }),
    html: `<main>${plain('eq-cond')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-among-fifty-static-siblings-does-not-shift-them',
    src: 'janux',
    page: () =>
      jsx('ul', {
        children: [...Array(50).keys()].map((n) => (n === 25 ? jsx('li', { children: jsx(awaited('eq-among', 5) as any, {}) }) : jsx('li', { children: n }))),
      }),
    html: `<ul>${[...Array(50).keys()]
      .map((n) => (n === 25 ? `<li>${plain('eq-among')}</li>` : `<li>${n}</li>`))
      .join('')}</ul>`,
  },
  {
    id: 'stream2-eq-two-sibling-subtrees-each-holding-an-island-interleave-nothing',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [
          jsx('section', { children: [jsx('h1', { children: 'l' }), jsx(awaited('eq-left', 9) as any, {})] }),
          jsx('section', { children: [jsx('h1', { children: 'r' }), jsx(awaited('eq-right', 1) as any, {})] }),
        ],
      }),
    html: `<main><section><h1>l</h1>${plain('eq-left')}</section><section><h1>r</h1>${plain('eq-right')}</section></main>`,
  },
  {
    id: 'stream2-eq-an-island-whose-source-resolves-immediately-still-gets-a-host',
    src: 'janux',
    page: () => jsx(awaited('eq-instant', 0) as any, {}),
    html: plain('eq-instant'),
  },
  {
    id: 'stream2-eq-an-island-nested-inside-a-fragment-inside-an-array',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [jsx(Fragment, { children: [jsx(awaited('eq-infrag', 3) as any, {})] }), jsx('p', { children: 'tail' })],
      }),
    html: `<main>${plain('eq-infrag')}<p>tail</p></main>`,
  },
  {
    id: 'stream2-eq-escaped-text-around-an-island-is-escaped-once',
    src: 'janux',
    page: () => jsx('main', { children: ['<a&b>', jsx(awaited('eq-esc', 3) as any, {}), '"quoted"'] }),
    html: `<main>&lt;a&amp;b&gt;${plain('eq-esc')}&quot;quoted&quot;</main>`,
  },
  {
    id: 'stream2-eq-an-island-holding-a-danger-html-child-keeps-the-raw-bytes',
    src: 'janux',
    page: () => jsx(awaited('eq-raw', 3, () => jsx('div', { dangerHTML: '<b>x</b>' })) as any, {}),
    html: host('eq-raw', '<div><b>x</b></div>'),
  },
  {
    id: 'stream2-eq-a-style-object-on-a-sibling-of-an-island-serializes-once',
    src: 'janux',
    page: () => jsx('main', { children: [jsx('div', { style: { color: 'red', marginTop: '2px' } }), jsx(awaited('eq-style', 3) as any, {})] }),
    html: `<main><div style="color:red;margin-top:2px"></div>${plain('eq-style')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-tree-eight-siblings-wide-and-two-deep',
    src: 'janux',
    page: () => {
      const leaf = awaited('eq-wide', 2);

      return jsx('main', { children: [...Array(8).keys()].map((n) => jsx('div', { children: jsx(leaf as any, { key: `w${n}` }) })) });
    },
    html: `<main>${[...Array(8).keys()].map((n) => `<div>${plain('eq-wide', `w${n}`)}</div>`).join('')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-after-a-deeply-nested-static-subtree',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [
          [...Array(6).keys()].reduce<unknown>((inner) => jsx('span', { children: inner }), 'x'),
          jsx(awaited('eq-after-deep', 4) as any, {}),
        ],
      }),
    html: `<main>${'<span>'.repeat(6)}x${'</span>'.repeat(6)}${plain('eq-after-deep')}</main>`,
  },
  {
    id: 'stream2-eq-an-islands-view-returning-a-number-streams-it-as-text',
    src: 'janux',
    page: () => jsx(awaited('eq-num', 3, () => 42) as any, {}),
    html: host('eq-num', '42'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-a-bigint-streams-it-as-text',
    src: 'janux',
    page: () => jsx(awaited('eq-big', 3, () => 9007199254740993n) as any, {}),
    html: host('eq-big', '9007199254740993'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-an-empty-array-leaves-an-empty-host',
    src: 'janux',
    page: () => jsx(awaited('eq-emptyarr', 3, () => []) as any, {}),
    html: host('eq-emptyarr', ''),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-nested-arrays-flattens-them',
    src: 'janux',
    page: () => jsx(awaited('eq-nestarr', 3, () => [[jsx('i', { children: '1' })], [jsx('i', { children: '2' }), jsx('i', { children: '3' })]]) as any, {}),
    html: host('eq-nestarr', '<i>1</i><i>2</i><i>3</i>'),
  },
  {
    id: 'stream2-eq-an-islands-view-returning-a-void-element-self-closes-inside-the-host',
    src: 'janux',
    page: () => jsx(awaited('eq-void', 3, () => jsx('hr', {})) as any, {}),
    html: host('eq-void', '<hr/>'),
  },
  {
    id: 'stream2-eq-an-island-with-an-id-prop-is-keyed-by-that-id',
    src: 'janux',
    page: () => jsx(awaited('eq-byid', 3) as any, { id: 'panel' }),
    // The prop keys the island; it is not copied onto the host element.
    html: plain('eq-byid', 'panel'),
  },
  {
    id: 'stream2-eq-an-explicit-key-with-a-dot-keeps-the-dot',
    src: 'janux',
    page: () => jsx(awaited('eq-dotkey', 3) as any, { key: 'a.b' }),
    html: plain('eq-dotkey', 'a.b'),
  },
  {
    id: 'stream2-eq-a-numeric-explicit-key-becomes-the-islands-identity',
    src: 'janux',
    page: () => jsx(awaited('eq-numkey', 3) as any, { key: 7 }),
    html: plain('eq-numkey', '7'),
  },
  {
    id: 'stream2-eq-three-islands-of-one-module-take-default-n2-and-n3',
    src: 'janux',
    page: () => {
      const def = awaited('eq-three', 3);

      return jsx('main', { children: [jsx(def as any, {}), jsx(def as any, {}), jsx(def as any, {})] });
    },
    html: `<main>${plain('eq-three')}${plain('eq-three', 'n2')}${plain('eq-three', 'n3')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-first-among-twenty-siblings-releases-the-cursor-for-all-of-them',
    src: 'janux',
    page: () =>
      jsx('main', { children: [jsx(awaited('eq-head20', 8) as any, {}), ...[...Array(20).keys()].map((n) => jsx('p', { children: n }))] }),
    html: `<main>${plain('eq-head20')}${[...Array(20).keys()].map((n) => `<p>${n}</p>`).join('')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-last-among-twenty-siblings-arrives-after-all-of-them',
    src: 'janux',
    page: () =>
      jsx('main', { children: [...[...Array(20).keys()].map((n) => jsx('p', { children: n })), jsx(awaited('eq-tail20', 8) as any, {})] }),
    html: `<main>${[...Array(20).keys()].map((n) => `<p>${n}</p>`).join('')}${plain('eq-tail20')}</main>`,
  },
  {
    id: 'stream2-eq-islands-at-both-ends-of-a-long-sibling-list-keep-their-places',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [
          jsx(awaited('eq-ends-a', 9) as any, {}),
          ...[...Array(10).keys()].map((n) => jsx('p', { children: n })),
          jsx(awaited('eq-ends-b', 1) as any, {}),
        ],
      }),
    html: `<main>${plain('eq-ends-a')}${[...Array(10).keys()].map((n) => `<p>${n}</p>`).join('')}${plain('eq-ends-b')}</main>`,
  },
  {
    id: 'stream2-eq-an-island-holding-twenty-static-children-emits-them-in-order',
    src: 'janux',
    page: () => jsx(awaited('eq-manychildren', 3, () => [...Array(20).keys()].map((n) => jsx('li', { children: n }))) as any, {}),
    html: host('eq-manychildren', [...Array(20).keys()].map((n) => `<li>${n}</li>`).join('')),
  },
  {
    id: 'stream2-eq-three-island-levels-with-the-deepest-settling-last',
    src: 'janux',
    page: () => {
      const leaf = awaited('eq-rev-leaf', 12);
      const mid = awaited('eq-rev-mid', 6, () => jsx(leaf as any, {}));

      return jsx(awaited('eq-rev-top', 1, () => jsx(mid as any, {})) as any, {});
    },
    html: host(
      'eq-rev-top',
      host('eq-rev-mid', host('eq-rev-leaf', '<p>eq-rev-leaf</p>', 'eq-rev-mid.eq-rev-top.default.1.1'), 'eq-rev-top.default.1'),
    ),
  },
  {
    id: 'stream2-eq-two-adjacent-islands-with-no-wrapper-between-them',
    src: 'janux',
    page: () => [jsx(awaited('eq-adj-a', 4) as any, {}), jsx(awaited('eq-adj-b', 2) as any, {})],
    html: `${plain('eq-adj-a')}${plain('eq-adj-b')}`,
  },
  {
    id: 'stream2-eq-an-island-inside-two-nested-fragments',
    src: 'janux',
    page: () => jsx(Fragment, { children: jsx(Fragment, { children: jsx(awaited('eq-deepfrag', 3) as any, {}) }) }),
    html: plain('eq-deepfrag'),
  },
  {
    id: 'stream2-eq-a-select-and-its-options-around-an-island',
    src: 'janux',
    page: () =>
      jsx('form', {
        children: [
          jsx('select', { name: 'size', children: [jsx('option', { value: 's', children: 'S' }), jsx('option', { value: 'm', selected: true, children: 'M' })] }),
          jsx(awaited('eq-form', 3) as any, {}),
        ],
      }),
    html: `<form><select name="size"><option value="s">S</option><option value="m" selected>M</option></select>${plain('eq-form')}</form>`,
  },
  {
    id: 'stream2-eq-a-pre-block-keeps-its-whitespace-around-an-island',
    src: 'janux',
    page: () => jsx('div', { children: [jsx('pre', { children: '  two  spaces\n  and a line' }), jsx(awaited('eq-pre', 3) as any, {})] }),
    html: `<div><pre>  two  spaces\n  and a line</pre>${plain('eq-pre')}</div>`,
  },
  {
    id: 'stream2-eq-a-style-element-sibling-of-an-island-keeps-its-css-verbatim',
    src: 'janux',
    page: () => jsx('div', { children: [jsx('style', { children: '.a{color:red}' }), jsx(awaited('eq-styletag', 3) as any, {})] }),
    html: `<div><style>.a{color:red}</style>${plain('eq-styletag')}</div>`,
  },
  {
    id: 'stream2-eq-an-island-whose-content-is-a-danger-html-only-element',
    src: 'janux',
    page: () => jsx('div', { children: [jsx(awaited('eq-rawisland', 3, () => jsx('span', { dangerHTML: '<em>&amp;</em>' })) as any, {}), jsx('p', { children: 'after' })] }),
    html: `<div>${host('eq-rawisland', '<span><em>&amp;</em></span>')}<p>after</p></div>`,
  },
  {
    id: 'stream2-eq-text-with-entities-on-both-sides-of-an-island',
    src: 'janux',
    page: () => jsx('p', { children: ['5 < 6 && ', jsx(awaited('eq-entities', 3) as any, {}), ' > 4'] }),
    html: `<p>5 &lt; 6 &amp;&amp; ${plain('eq-entities')} &gt; 4</p>`,
  },
  {
    id: 'stream2-eq-a-page-that-is-a-single-text-node-streams-as-that-text',
    src: 'janux',
    page: () => 'just text & nothing else',
    html: 'just text &amp; nothing else',
  },
  {
    id: 'stream2-eq-a-page-that-is-a-single-number-streams-as-that-number',
    src: 'janux',
    page: () => 2026,
    html: '2026',
  },
  {
    id: 'stream2-eq-an-island-under-five-elements-with-async-siblings-beside-it',
    src: 'janux',
    page: () =>
      jsx('main', {
        children: [
          jsx(awaited('eq-buried-sib', 6) as any, {}),
          jsx('a', { children: jsx('b', { children: jsx('i', { children: jsx('u', { children: jsx('s', { children: jsx(awaited('eq-buried', 2) as any, {}) }) }) }) }) }),
        ],
      }),
    html: `<main>${plain('eq-buried-sib')}<a><b><i><u><s>${plain('eq-buried')}</s></u></i></b></a></main>`,
  },
];
