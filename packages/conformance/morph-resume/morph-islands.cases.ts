import type { MorphRow } from './morph.cases';

/**
 * Island and foreign-root boundaries under `morph`, beyond the basics in
 * `morph.cases.ts`. Hosts are matched by island id among each parent's OWN
 * children (`liveIslandHosts` is per-parent, not global), reuse never looks
 * inside (the island's runtime owns that), and only the host's attributes
 * sync. The rows pin the shape of that opacity: it is recursive, it is
 * per-boundary-kind, it survives sibling churn, and an empty incoming
 * placeholder never wipes a live host.
 */

const ISLAND = (id: string, inner: string) => `<janux-island data-jx="${id}">${inner}</janux-island>`;
const FOREIGN = (id: string, inner: string) => `<janux-foreign data-jx="${id}">${inner}</janux-foreign>`;

export const MORPH_ISLAND_CASES: MorphRow[] = [
  // ── reuse by id, under churn ───────────────────────────────────────────────
  { id: 'morph-two-islands-swap-while-a-static-sibling-stays', src: 'janux', from: `<p>s</p>${ISLAND('a#1', 'A')}${ISLAND('b#1', 'B')}`, to: `<p>s</p>${ISLAND('b#1', 'B2')}${ISLAND('a#1', 'A2')}`, expected: `<p>s</p>${ISLAND('b#1', 'B')}${ISLAND('a#1', 'A')}` },
  { id: 'morph-two-islands-keep-their-content-when-order-holds', src: 'janux', from: `${ISLAND('a#1', 'A')}${ISLAND('b#1', 'B')}`, to: `${ISLAND('a#1', 'newA')}${ISLAND('b#1', 'newB')}`, expected: `${ISLAND('a#1', 'A')}${ISLAND('b#1', 'B')}` },
  { id: 'morph-an-island-is-reused-while-a-sibling-changes-tag', src: 'janux', from: `<p>x</p>${ISLAND('a#1', 'A')}`, to: `<span>x</span>${ISLAND('a#1', 'srv')}`, expected: `<span>x</span>${ISLAND('a#1', 'A')}` },
  { id: 'morph-an-island-removed-from-the-middle-shifts-siblings-up', src: 'janux', from: `<p>a</p>${ISLAND('a#1', 'A')}<p>b</p>`, to: '<p>a</p><p>b</p>', expected: '<p>a</p><p>b</p>' },
  { id: 'morph-an-island-id-with-the-full-key-charset-still-matches', src: 'janux', from: ISLAND('cart#parent.default.1~x-y', 'LIVE'), to: ISLAND('cart#parent.default.1~x-y', 'srv'), expected: ISLAND('cart#parent.default.1~x-y', 'LIVE') },
  { id: 'morph-an-island-is-reused-when-node-kinds-shift-around-it', src: 'janux', from: `lead${ISLAND('a#1', 'A')}`, to: `<p>lead</p>${ISLAND('a#1', 'srv')}`, expected: `<p>lead</p>${ISLAND('a#1', 'A')}` },

  // ── opacity is total and recursive ─────────────────────────────────────────
  { id: 'morph-a-nested-island-inside-a-patched-subtree-stays-opaque', src: 'janux', from: `<div><p>o</p>${ISLAND('n#1', 'OLD')}</div>`, to: `<div><p>n</p>${ISLAND('n#1', 'NEW')}</div>`, expected: `<div><p>n</p>${ISLAND('n#1', 'OLD')}</div>` },
  { id: 'morph-an-island-nested-in-an-island-is-never-reached', src: 'janux', from: ISLAND('outer#1', `<p>a</p>${ISLAND('inner#1', 'I')}`), to: ISLAND('outer#1', `<p>b</p>${ISLAND('inner#1', 'X')}`), expected: ISLAND('outer#1', `<p>a</p>${ISLAND('inner#1', 'I')}`) },
  { id: 'morph-an-empty-incoming-placeholder-never-wipes-a-live-island', src: 'janux', from: ISLAND('a#1', '<p>live</p>'), to: ISLAND('a#1', ''), expected: ISLAND('a#1', '<p>live</p>') },
  { id: 'morph-island-reuse-is-per-parent-not-global', src: 'janux', from: ISLAND('a#1', 'LIVE'), to: `<div>${ISLAND('a#1', 'srv')}</div>`, expected: `<div>${ISLAND('a#1', 'srv')}</div>` },
  { id: 'morph-an-island-hoisted-out-of-a-container-arrives-fresh', src: 'janux', from: `<div>${ISLAND('a#1', 'LIVE')}</div>`, to: `${ISLAND('a#1', 'srv')}<div></div>`, expected: `${ISLAND('a#1', 'srv')}<div></div>` },

  // ── the host's own attributes still sync ───────────────────────────────────
  { id: 'morph-an-island-host-gains-a-view-attribute-content-untouched', src: 'janux', from: ISLAND('a#1', 'LIVE'), to: `<janux-island data-jx="a#1" class="wide">srv</janux-island>`, expected: `<janux-island data-jx="a#1" class="wide">LIVE</janux-island>` },
  { id: 'morph-an-island-host-keeps-a-runtime-class-through-the-sync', src: 'janux', from: `<janux-island data-jx="a#1" class="janux-glow">LIVE</janux-island>`, to: ISLAND('a#1', 'srv'), expected: `<janux-island data-jx="a#1" class="janux-glow">LIVE</janux-island>` },
  { id: 'morph-an-incoming-pending-marker-lands-on-the-live-host', src: 'janux', from: ISLAND('a#1', '<p>live</p>'), to: `<janux-island data-jx="a#1" data-jx-pending=""><p>wait</p></janux-island>`, expected: `<janux-island data-jx="a#1" data-jx-pending=""><p>live</p></janux-island>` },

  // ── boundary kinds do not blur ─────────────────────────────────────────────
  { id: 'morph-an-island-never-morphs-into-a-foreign-with-the-same-id', src: 'janux', from: ISLAND('r#1', 'A'), to: FOREIGN('r#1', 'B'), expected: FOREIGN('r#1', 'B') },
  { id: 'morph-a-foreign-root-is-reused-across-a-position-change', src: 'janux', from: `${FOREIGN('f#1', '<div>F</div>')}<p>x</p>`, to: `<p>x</p>${FOREIGN('f#1', '<div>srv</div>')}`, expected: `<p>x</p>${FOREIGN('f#1', '<div>F</div>')}` },
  { id: 'morph-a-foreign-root-whose-id-changed-is-replaced', src: 'janux', from: FOREIGN('f#1', '<div>OLD</div>'), to: FOREIGN('f#2', '<div>NEW</div>'), expected: FOREIGN('f#2', '<div>NEW</div>') },
  { id: 'morph-a-foreign-host-attribute-syncs-without-touching-content', src: 'janux', from: FOREIGN('f#1', '<div>F</div>'), to: `<janux-foreign data-jx="f#1" data-ready="">srv</janux-foreign>`, expected: `<janux-foreign data-jx="f#1" data-ready=""><div>F</div></janux-foreign>` },
  { id: 'morph-a-lookalike-custom-tag-is-not-a-boundary', src: 'janux', from: '<janux-islandx data-jx="a#1"><p>old</p></janux-islandx>', to: '<janux-islandx data-jx="a#1"><p>new</p></janux-islandx>', expected: '<janux-islandx data-jx="a#1"><p>new</p></janux-islandx>' },
  { id: 'morph-an-island-without-a-data-jx-only-matches-its-twin', src: 'janux', from: '<janux-island><p>old</p></janux-island>', to: '<janux-island><p>new</p></janux-island>', expected: '<janux-island><p>old</p></janux-island>' },
  { id: 'morph-an-island-swaps-position-with-a-plain-element', src: 'janux', from: `${ISLAND('a#1', 'LIVE')}<p>text</p>`, to: `<p>text</p>${ISLAND('a#1', 'srv')}`, expected: `<p>text</p>${ISLAND('a#1', 'LIVE')}` },
  { id: 'morph-dropping-the-first-island-does-not-confuse-the-second', src: 'janux', from: `${ISLAND('a#1', 'A')}${ISLAND('b#1', 'B')}`, to: ISLAND('b#1', 'srv'), expected: ISLAND('b#1', 'B') },
  { id: 'morph-an-island-inside-a-table-body-is-reused', src: 'janux', from: `<table><tbody><tr><td>${ISLAND('cell#1', 'LIVE')}</td></tr></tbody></table>`, to: `<table><tbody><tr><td>${ISLAND('cell#1', 'srv')}</td></tr></tbody></table>`, expected: `<table><tbody><tr><td>${ISLAND('cell#1', 'LIVE')}</td></tr></tbody></table>` },
  { id: 'morph-island-ids-are-case-sensitive', src: 'janux', from: ISLAND('Cart#1', 'OLD'), to: ISLAND('cart#1', 'NEW'), expected: ISLAND('cart#1', 'NEW') },
  { id: 'morph-a-foreign-nested-in-an-island-is-doubly-shielded', src: 'janux', from: ISLAND('a#1', `${FOREIGN('f#1', '<div>F</div>')}`), to: ISLAND('a#1', `${FOREIGN('f#1', '<div>X</div>')}`), expected: ISLAND('a#1', `${FOREIGN('f#1', '<div>F</div>')}`) },
  { id: 'morph-an-island-and-a-foreign-swap-positions-each-reused-by-id', src: 'janux', from: `${ISLAND('a#1', 'A')}${FOREIGN('f#1', '<div>F</div>')}`, to: `${FOREIGN('f#1', '<div>srv</div>')}${ISLAND('a#1', 'srv')}`, expected: `${FOREIGN('f#1', '<div>F</div>')}${ISLAND('a#1', 'A')}` },
];
