import type { Case } from '../support/case';

/**
 * DOM patching: `morph(root, nextChildren)`.
 *
 * Janux matches children by client render key when both sides carry one (an
 * off-DOM WeakMap — see client/keys.ts and the identity tests in
 * client/morph.test.ts), by index and tag otherwise, and treats island hosts
 * as opaque boundaries reused by id. These innerHTML rows exercise the
 * index+tag path; keyed identity cannot be asserted through innerHTML, so it
 * lives in the unit tests. The rows that matter are the ones every
 * in-place patcher has broken: attributes that must be *removed*, runtime classes
 * the view never renders, a boundary the patch must not step across, and controlled
 * inputs where the attribute and the property disagree.
 *
 * Cases follow `preact:browser/keys`, `vue:rendererChildren` and morphdom's
 * special-element handling.
 */
export interface MorphCase {
  /** Initial `innerHTML` of the root. */
  from: string;
  /** Markup whose children are handed to `morph`. */
  to: string;
  /** The root's `innerHTML` afterwards. */
  expected: string;
}

export type MorphRow = Case<MorphCase>;

const ISLAND = (id: string, inner: string) => `<janux-island data-jx="${id}">${inner}</janux-island>`;

export const MORPH_CASES: MorphRow[] = [
  // ── text ────────────────────────────────────────────────────────────────────
  { id: 'morph-updates-a-text-node', src: 'vue:rendererChildren#text', from: 'old', to: 'new', expected: 'new' },
  { id: 'morph-leaves-identical-text-alone', src: 'janux', from: 'same', to: 'same', expected: 'same' },
  { id: 'morph-empties-a-text-node', src: 'janux', from: 'old', to: '', expected: '' },
  { id: 'morph-adds-text-where-there-was-none', src: 'janux', from: '', to: 'new', expected: 'new' },
  { id: 'morph-updates-text-inside-an-element', src: 'vue:rendererChildren#nested-text', from: '<p>old</p>', to: '<p>new</p>', expected: '<p>new</p>' },
  { id: 'morph-keeps-whitespace-exactly', src: 'janux', from: '<p>a  b</p>', to: '<p>a b</p>', expected: '<p>a b</p>' },
  { id: 'morph-updates-text-to-an-entity-escaped-value', src: 'janux', from: '<p>a</p>', to: '<p>a &amp; b</p>', expected: '<p>a &amp; b</p>' },

  // ── attributes ──────────────────────────────────────────────────────────────
  { id: 'morph-adds-an-attribute', src: 'vue:rendererElement#attrs', from: '<p>x</p>', to: '<p id="a">x</p>', expected: '<p id="a">x</p>' },
  { id: 'morph-updates-an-attribute', src: 'vue:rendererElement#attr-update', from: '<p id="a">x</p>', to: '<p id="b">x</p>', expected: '<p id="b">x</p>' },
  { id: 'morph-removes-an-attribute-the-new-render-dropped', src: 'vue:rendererElement#attr-remove', from: '<p id="a" title="t">x</p>', to: '<p id="a">x</p>', expected: '<p id="a">x</p>' },
  { id: 'morph-removes-every-attribute-when-none-remain', src: 'janux', from: '<p id="a" title="t">x</p>', to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-keeps-an-unchanged-attribute', src: 'janux', from: '<p id="a">x</p>', to: '<p id="a">y</p>', expected: '<p id="a">y</p>' },
  { id: 'morph-updates-an-attribute-to-empty', src: 'janux', from: '<p id="a">x</p>', to: '<p id="">x</p>', expected: '<p id="">x</p>' },
  { id: 'morph-syncs-a-data-attribute', src: 'janux', from: '<p data-n="1">x</p>', to: '<p data-n="2">x</p>', expected: '<p data-n="2">x</p>' },
  { id: 'morph-syncs-an-aria-attribute', src: 'janux', from: '<p aria-hidden="true">x</p>', to: '<p aria-hidden="false">x</p>', expected: '<p aria-hidden="false">x</p>' },
  { id: 'morph-syncs-a-delegation-marker', src: 'janux', from: '<button data-jxa="c:a">x</button>', to: '<button data-jxa="c:b">x</button>', expected: '<button data-jxa="c:b">x</button>' },
  { id: 'morph-removes-a-delegation-marker', src: 'janux', from: '<button data-jxa="c:a">x</button>', to: '<button>x</button>', expected: '<button>x</button>' },

  // ── runtime classes belong to the runtime ───────────────────────────────────
  { id: 'morph-keeps-a-janux-runtime-class-when-the-class-changes', src: 'janux', from: '<p class="a janux-glow">x</p>', to: '<p class="b">y</p>', expected: '<p class="b janux-glow">y</p>' },
  { id: 'morph-keeps-a-runtime-class-when-the-view-renders-none', src: 'janux', from: '<p class="janux-glow">x</p>', to: '<p>y</p>', expected: '<p class="janux-glow">y</p>' },
  { id: 'morph-keeps-several-runtime-classes', src: 'janux', from: '<p class="janux-glow janux-busy">x</p>', to: '<p class="v">y</p>', expected: '<p class="v janux-glow janux-busy">y</p>' },
  { id: 'morph-does-not-invent-a-runtime-class', src: 'janux', from: '<p class="a">x</p>', to: '<p class="b">y</p>', expected: '<p class="b">y</p>' },
  { id: 'morph-replaces-a-non-runtime-class', src: 'janux', from: '<p class="old">x</p>', to: '<p class="new">x</p>', expected: '<p class="new">x</p>' },

  // ── structure ───────────────────────────────────────────────────────────────
  { id: 'morph-replaces-on-a-tag-change', src: 'vue:rendererChildren#different-tag', from: '<p>x</p>', to: '<span>x</span>', expected: '<span>x</span>' },
  { id: 'morph-replaces-an-element-with-text', src: 'janux', from: '<p>x</p>', to: 'plain', expected: 'plain' },
  { id: 'morph-replaces-text-with-an-element', src: 'janux', from: 'plain', to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-appends-a-new-child', src: 'vue:rendererChildren#append', from: '<p>a</p>', to: '<p>a</p><p>b</p>', expected: '<p>a</p><p>b</p>' },
  { id: 'morph-removes-a-trailing-child', src: 'vue:rendererChildren#remove', from: '<p>a</p><p>b</p>', to: '<p>a</p>', expected: '<p>a</p>' },
  { id: 'morph-removes-every-child', src: 'janux', from: '<p>a</p><p>b</p>', to: '', expected: '' },
  { id: 'morph-fills-an-empty-root', src: 'janux', from: '', to: '<p>a</p><p>b</p>', expected: '<p>a</p><p>b</p>' },
  { id: 'morph-shifts-content-up-when-the-first-child-goes', src: 'preact:keys#unkeyed-shift', from: '<p>a</p><p>b</p>', to: '<p>b</p>', expected: '<p>b</p>' },
  { id: 'morph-matches-by-index-so-a-reversal-rewrites-content', src: 'preact:keys#unkeyed-reorder', from: '<p>a</p><p>b</p>', to: '<p>b</p><p>a</p>', expected: '<p>b</p><p>a</p>' },
  { id: 'morph-patches-a-nested-tree', src: 'vue:rendererChildren#deep', from: '<div><ul><li>a</li></ul></div>', to: '<div><ul><li>b</li><li>c</li></ul></div>', expected: '<div><ul><li>b</li><li>c</li></ul></div>' },
  { id: 'morph-adds-a-level-of-nesting', src: 'janux', from: '<div>a</div>', to: '<div><span>a</span></div>', expected: '<div><span>a</span></div>' },
  { id: 'morph-removes-a-level-of-nesting', src: 'janux', from: '<div><span>a</span></div>', to: '<div>a</div>', expected: '<div>a</div>' },
  { id: 'morph-handles-a-mixed-child-list', src: 'janux', from: '<p>a</p>text<span>b</span>', to: '<p>x</p>other<span>y</span>', expected: '<p>x</p>other<span>y</span>' },
  { id: 'morph-updates-a-comment', src: 'janux', from: '<!--old-->', to: '<!--new-->', expected: '<!--new-->' },
  { id: 'morph-keeps-a-void-element', src: 'janux', from: '<br>', to: '<br>', expected: '<br>' },
  { id: 'morph-updates-a-void-element-attribute', src: 'janux', from: '<img src="a.png">', to: '<img src="b.png">', expected: '<img src="b.png">' },

  // ── island boundaries ───────────────────────────────────────────────────────
  { id: 'morph-never-patches-inside-an-island', src: 'janux', from: ISLAND('a#1', '<p>old</p>'), to: ISLAND('a#1', '<p>new</p>'), expected: ISLAND('a#1', '<p>old</p>') },
  { id: 'morph-still-syncs-an-island-host-attribute', src: 'janux', from: `<janux-island data-jx="a#1" data-jx-eager="">x</janux-island>`, to: ISLAND('a#1', 'x'), expected: ISLAND('a#1', 'x') },
  { id: 'morph-reuses-an-island-host-across-a-position-change', src: 'janux', from: `${ISLAND('a#1', 'A')}${ISLAND('b#1', 'B')}`, to: `${ISLAND('b#1', 'B2')}${ISLAND('a#1', 'A2')}`, expected: `${ISLAND('b#1', 'B')}${ISLAND('a#1', 'A')}` },
  { id: 'morph-replaces-an-island-whose-id-changed', src: 'janux', from: ISLAND('a#1', 'A'), to: ISLAND('a#2', 'NEW'), expected: ISLAND('a#2', 'NEW') },
  { id: 'morph-inserts-a-new-island-with-its-server-content', src: 'janux', from: '<p>x</p>', to: `<p>x</p>${ISLAND('a#1', 'fresh')}`, expected: `<p>x</p>${ISLAND('a#1', 'fresh')}` },
  { id: 'morph-drops-an-island-the-new-render-omits', src: 'janux', from: `<p>x</p>${ISLAND('a#1', 'A')}`, to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-does-not-morph-an-island-into-a-plain-element', src: 'janux', from: ISLAND('a#1', 'A'), to: '<p>plain</p>', expected: '<p>plain</p>' },
  { id: 'morph-does-not-morph-a-plain-element-into-an-island', src: 'janux', from: '<p>plain</p>', to: ISLAND('a#1', 'A'), expected: ISLAND('a#1', 'A') },
  { id: 'morph-treats-a-foreign-root-as-a-boundary-too', src: 'janux', from: '<janux-foreign data-jx="r#1"><div>old</div></janux-foreign>', to: '<janux-foreign data-jx="r#1"><div>new</div></janux-foreign>', expected: '<janux-foreign data-jx="r#1"><div>old</div></janux-foreign>' },
  { id: 'morph-keeps-an-island-when-siblings-around-it-change', src: 'janux', from: `<p>a</p>${ISLAND('a#1', 'A')}<p>b</p>`, to: `<p>x</p>${ISLAND('a#1', 'ignored')}<p>y</p>`, expected: `<p>x</p>${ISLAND('a#1', 'A')}<p>y</p>` },
];
