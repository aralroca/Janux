import type { Case } from '../support/case';

/**
 * Keyed reconciliation through `morph`. Render keys live OFF the DOM (a
 * WeakMap the runner fills via `setNodeKey`, exactly as `toDomNodes` does), so
 * these rows carry the keys next to the markup and the runner stamps them
 * before morphing. Two things are asserted per row: the final markup, and
 * *which live node* fills each slot — `identity` letters the original
 * children `A`, `B`, `C`… in order and marks a freshly created node `+`.
 * Reuse is the whole point of keys, so a row that reorders correctly but
 * recreates the nodes must fail.
 *
 * The reorder patterns follow `preact:keys`, `vue:rendererChildren#keyed` and
 * diff-dom-streaming's key suite; the adoption invariants are Janux's own
 * (`claimedElsewhere` in client/keys.ts).
 */

type Key = string | number | null;

export interface KeyedCase {
  /** The live root's children: [render key (null = unkeyed), one child's HTML]. */
  from: Array<[Key, string]>;
  /** The incoming children, keyed the same way. */
  to: Array<[Key, string]>;
  /** Root `innerHTML` after the morph. */
  expected: string;
  /** Original node occupying each final slot: `A` = first `from` child, `+` = fresh node. */
  identity: string;
}

export type KeyedRow = Case<KeyedCase>;

const LI = (text: string) => `<li>${text}</li>`;

export const MORPH_KEYED_CASES: KeyedRow[] = [
  // ── pure permutations move nodes instead of rewriting them ─────────────────
  { id: 'morph-keyed-swaps-the-two-ends', src: 'preact:keys#swap-ends', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['c', LI('c')], ['b', LI('b')], ['a', LI('a')]], expected: '<li>c</li><li>b</li><li>a</li>', identity: 'CBA' },
  { id: 'morph-keyed-reverses-four-items', src: 'preact:keys#reverse', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['d', LI('d')], ['c', LI('c')], ['b', LI('b')], ['a', LI('a')]], expected: '<li>d</li><li>c</li><li>b</li><li>a</li>', identity: 'DCBA' },
  { id: 'morph-keyed-rotates-the-first-item-to-the-back', src: 'vue:rendererChildren#keyed-rotate', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['b', LI('b')], ['c', LI('c')], ['a', LI('a')]], expected: '<li>b</li><li>c</li><li>a</li>', identity: 'BCA' },
  { id: 'morph-keyed-rotates-the-last-item-to-the-front', src: 'vue:rendererChildren#keyed-rotate-back', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['c', LI('c')], ['a', LI('a')], ['b', LI('b')]], expected: '<li>c</li><li>a</li><li>b</li>', identity: 'CAB' },
  { id: 'morph-keyed-moves-one-middle-item-forward', src: 'diff-dom-streaming:index#key-move-shuffling', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['a', LI('a')], ['c', LI('c')], ['d', LI('d')], ['b', LI('b')]], expected: '<li>a</li><li>c</li><li>d</li><li>b</li>', identity: 'ACDB' },
  { id: 'morph-keyed-moves-one-middle-item-backward', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['a', LI('a')], ['d', LI('d')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>d</li><li>b</li><li>c</li>', identity: 'ADBC' },
  { id: 'morph-keyed-swaps-an-adjacent-pair-at-the-head', src: 'preact:keys#swap-adjacent', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['b', LI('b')], ['a', LI('a')], ['c', LI('c')], ['d', LI('d')]], expected: '<li>b</li><li>a</li><li>c</li><li>d</li>', identity: 'BACD' },
  { id: 'morph-keyed-swaps-the-two-inner-items', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['a', LI('a')], ['c', LI('c')], ['b', LI('b')], ['d', LI('d')]], expected: '<li>a</li><li>c</li><li>b</li><li>d</li>', identity: 'ACBD' },
  { id: 'morph-keyed-survives-a-full-shuffle-of-six', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')], ['e', LI('e')], ['f', LI('f')]], to: [['f', LI('f')], ['d', LI('d')], ['b', LI('b')], ['e', LI('e')], ['c', LI('c')], ['a', LI('a')]], expected: '<li>f</li><li>d</li><li>b</li><li>e</li><li>c</li><li>a</li>', identity: 'FDBECA' },
  { id: 'morph-keyed-an-identical-list-reuses-every-node', src: 'janux', from: [['a', LI('a')], ['b', LI('b')]], to: [['a', LI('a')], ['b', LI('b')]], expected: '<li>a</li><li>b</li>', identity: 'AB' },
  { id: 'morph-keyed-swaps-the-ends-of-five-keeping-the-middle', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')], ['e', LI('e')]], to: [['e', LI('e')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')], ['a', LI('a')]], expected: '<li>e</li><li>b</li><li>c</li><li>d</li><li>a</li>', identity: 'EBCDA' },
  { id: 'morph-keyed-rotates-five-by-two-positions', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')], ['e', LI('e')]], to: [['c', LI('c')], ['d', LI('d')], ['e', LI('e')], ['a', LI('a')], ['b', LI('b')]], expected: '<li>c</li><li>d</li><li>e</li><li>a</li><li>b</li>', identity: 'CDEAB' },

  // ── insertions and removals around surviving keys ──────────────────────────
  { id: 'morph-keyed-inserts-a-new-key-at-the-head', src: 'preact:keys#insert-head', from: [['b', LI('b')], ['c', LI('c')]], to: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>c</li>', identity: '+AB' },
  { id: 'morph-keyed-inserts-a-new-key-in-the-middle', src: 'diff-dom-streaming:index#key-insert', from: [['a', LI('a')], ['c', LI('c')]], to: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>c</li>', identity: 'A+B' },
  { id: 'morph-keyed-appends-a-new-key-at-the-tail', src: 'janux', from: [['a', LI('a')], ['b', LI('b')]], to: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>c</li>', identity: 'AB+' },
  { id: 'morph-keyed-removes-the-head-and-keeps-the-rest-alive', src: 'preact:keys#remove-head', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['b', LI('b')], ['c', LI('c')]], expected: '<li>b</li><li>c</li>', identity: 'BC' },
  { id: 'morph-keyed-removes-a-middle-item-without-touching-neighbours', src: 'diff-dom-streaming:index#key-remove', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['a', LI('a')], ['c', LI('c')]], expected: '<li>a</li><li>c</li>', identity: 'AC' },
  { id: 'morph-keyed-removes-the-tail-item', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [['a', LI('a')], ['b', LI('b')]], expected: '<li>a</li><li>b</li>', identity: 'AB' },
  { id: 'morph-keyed-removes-and-reorders-in-the-same-pass', src: 'diff-dom-streaming:index#key-move-deleting', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['d', LI('d')], ['b', LI('b')]], expected: '<li>d</li><li>b</li>', identity: 'DB' },
  { id: 'morph-keyed-slides-the-key-window-by-one', src: 'janux', from: [['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>c</li>', identity: '+AB' },
  { id: 'morph-keyed-replaces-one-key-with-three-fresh-ones', src: 'janux', from: [['a', LI('a')]], to: [['x', LI('x')], ['y', LI('y')], ['z', LI('z')]], expected: '<li>x</li><li>y</li><li>z</li>', identity: '+++' },

  // ── the keyed-adoption invariants ──────────────────────────────────────────
  { id: 'morph-keyed-a-keyed-slot-never-adopts-a-differently-keyed-node', src: 'janux', from: [['a', LI('a')], ['b', LI('b')]], to: [['x', LI('x')], ['y', LI('y')]], expected: '<li>x</li><li>y</li>', identity: '++' },
  { id: 'morph-keyed-a-key-match-with-a-different-tag-is-a-replacement', src: 'janux', from: [['a', LI('a')]], to: [['a', '<p>a</p>']], expected: '<p>a</p>', identity: '+' },
  { id: 'morph-keyed-a-resumed-unkeyed-tree-adopts-keys-by-position', src: 'qwik:resumability#adopt', from: [[null, LI('a')], [null, LI('b')], [null, LI('c')]], to: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>c</li>', identity: 'ABC' },
  { id: 'morph-keyed-an-unkeyed-slot-must-not-consume-a-still-claimed-key', src: 'janux', from: [['a', LI('a')], [null, LI('u')]], to: [[null, LI('x')], ['a', LI('a2')]], expected: '<li>x</li><li>a2</li>', identity: '+A' },
  { id: 'morph-keyed-an-unkeyed-slot-may-consume-an-unclaimed-keyed-node', src: 'janux', from: [['a', LI('a')]], to: [[null, LI('x')]], expected: '<li>x</li>', identity: 'A' },
  { id: 'morph-keyed-a-numeric-key-is-not-its-string-twin', src: 'janux', from: [[1, LI('one')]], to: [['1', LI('one')]], expected: '<li>one</li>', identity: '+' },
  { id: 'morph-keyed-a-numeric-key-matches-itself-across-a-move', src: 'janux', from: [[1, LI('one')], [2, LI('two')]], to: [[2, LI('two')], [1, LI('one')]], expected: '<li>two</li><li>one</li>', identity: 'BA' },

  // ── keys and their surroundings ────────────────────────────────────────────
  { id: 'morph-keyed-statics-hold-position-around-a-reversing-list', src: 'janux', from: [[null, '<h2>head</h2>'], ['a', LI('a')], ['b', LI('b')], [null, '<p>foot</p>']], to: [[null, '<h2>head</h2>'], ['b', LI('b')], ['a', LI('a')], [null, '<p>foot</p>']], expected: '<h2>head</h2><li>b</li><li>a</li><p>foot</p>', identity: 'ACBD' },
  { id: 'morph-keyed-a-moved-node-carries-its-subtree-intact', src: 'preact:keys#subtree', from: [['a', '<li><b>deep</b>a</li>'], ['b', LI('b')]], to: [['b', LI('b')], ['a', '<li><b>deep</b>a</li>']], expected: '<li>b</li><li><b>deep</b>a</li>', identity: 'BA' },
  { id: 'morph-keyed-a-key-match-still-syncs-attributes', src: 'janux', from: [['a', '<li class="old">a</li>'], ['b', LI('b')]], to: [['b', LI('b')], ['a', '<li class="new">a</li>']], expected: '<li>b</li><li class="new">a</li>', identity: 'BA' },
  { id: 'morph-keyed-a-key-match-still-patches-children', src: 'janux', from: [['a', '<li><i>old</i></li>'], ['b', LI('b')]], to: [['b', LI('b')], ['a', '<li><i>new</i></li>']], expected: '<li>b</li><li><i>new</i></li>', identity: 'BA' },
  { id: 'morph-keyed-an-island-in-a-keyed-list-is-reused-by-island-id', src: 'janux', from: [[null, '<janux-island data-jx="w#1">W</janux-island>'], ['b', LI('b')]], to: [['b', LI('b')], [null, '<janux-island data-jx="w#1">ignored</janux-island>']], expected: '<li>b</li><janux-island data-jx="w#1">W</janux-island>', identity: 'BA' },
  { id: 'morph-keyed-mixed-list-keeps-unclaimed-unkeyed-nodes-by-index', src: 'janux', from: [['a', LI('a')], [null, LI('u1')], [null, LI('u2')]], to: [[null, LI('n')], ['a', LI('a')], [null, LI('u2x')]], expected: '<li>n</li><li>a</li><li>u2x</li>', identity: '+AC' },
  { id: 'morph-keyed-text-siblings-between-keyed-items-resolve-by-index', src: 'janux', from: [['a', LI('a')], [null, 'sep'], ['b', LI('b')]], to: [['b', LI('b')], [null, 'sep'], ['a', LI('a')]], expected: '<li>b</li>sep<li>a</li>', identity: 'CBA' },

  // ── block moves and windowed permutations ──────────────────────────────────
  { id: 'morph-keyed-swaps-two-adjacent-blocks', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['c', LI('c')], ['d', LI('d')], ['a', LI('a')], ['b', LI('b')]], expected: '<li>c</li><li>d</li><li>a</li><li>b</li>', identity: 'CDAB' },
  { id: 'morph-keyed-swaps-the-tail-pair-only', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')]], to: [['a', LI('a')], ['b', LI('b')], ['d', LI('d')], ['c', LI('c')]], expected: '<li>a</li><li>b</li><li>d</li><li>c</li>', identity: 'ABDC' },
  { id: 'morph-keyed-interleaves-two-halves', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')], ['d', LI('d')], ['e', LI('e')], ['f', LI('f')]], to: [['a', LI('a')], ['d', LI('d')], ['b', LI('b')], ['e', LI('e')], ['c', LI('c')], ['f', LI('f')]], expected: '<li>a</li><li>d</li><li>b</li><li>e</li><li>c</li><li>f</li>', identity: 'ADBECF' },
  { id: 'morph-keyed-empties-a-keyed-list', src: 'janux', from: [['a', LI('a')], ['b', LI('b')], ['c', LI('c')]], to: [], expected: '', identity: '' },
  { id: 'morph-keyed-fills-an-empty-root-with-keyed-items', src: 'janux', from: [], to: [['a', LI('a')], ['b', LI('b')]], expected: '<li>a</li><li>b</li>', identity: '++' },

  // ── key value edge shapes ──────────────────────────────────────────────────
  { id: 'morph-keyed-the-empty-string-is-a-real-key', src: 'janux', from: [['', LI('anon')], ['b', LI('b')]], to: [['b', LI('b')], ['', LI('anon')]], expected: '<li>b</li><li>anon</li>', identity: 'BA' },
  { id: 'morph-keyed-the-number-zero-is-not-the-string-zero', src: 'janux', from: [[0, LI('zero')]], to: [['0', LI('zero')]], expected: '<li>zero</li>', identity: '+' },
  { id: 'morph-keyed-a-unicode-key-matches-across-a-move', src: 'janux', from: [['clé', LI('fr')], ['b', LI('b')]], to: [['b', LI('b')], ['clé', LI('fr')]], expected: '<li>b</li><li>fr</li>', identity: 'BA' },

  // ── keys among unkeyed and mixed-tag neighbours ────────────────────────────
  { id: 'morph-keyed-an-anchor-key-holds-while-unkeyed-neighbours-rewrite', src: 'janux', from: [[null, LI('u1')], ['a', LI('a')], [null, LI('u2')]], to: [[null, LI('x')], ['a', LI('a')], [null, LI('y')]], expected: '<li>x</li><li>a</li><li>y</li>', identity: 'ABC' },
  { id: 'morph-keyed-a-move-hops-over-an-unkeyed-static', src: 'janux', from: [['a', LI('a')], [null, '<hr>'], ['b', LI('b')]], to: [['b', LI('b')], [null, '<hr>'], ['a', LI('a')]], expected: '<li>b</li><hr><li>a</li>', identity: 'CBA' },
  { id: 'morph-keyed-keys-move-nodes-across-mixed-tag-lists', src: 'janux', from: [['a', LI('a')], ['x', '<p>x</p>'], ['b', LI('b')]], to: [['b', LI('b')], ['x', '<p>x</p>'], ['a', LI('a')]], expected: '<li>b</li><p>x</p><li>a</li>', identity: 'CBA' },
];
