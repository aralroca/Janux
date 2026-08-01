import type { MorphRow } from './morph.cases';

/**
 * DOM patching, structural corpus: node kinds, nesting, special parsing
 * contexts. Same `morph(root, nextChildren)` contract as `morph.cases.ts` —
 * index+tag matching over `innerHTML` fixtures. These rows chase the places
 * where the DOM itself is irregular: tables and selects parse their children
 * through special insertion modes, `<pre>` keeps whitespace other elements
 * collapse, SVG switches namespace and attribute-case rules, and text,
 * comment and element nodes each replace differently because `sameKind`
 * only reuses within a node type.
 */

export const MORPH_TREE_CASES: MorphRow[] = [
  // ── text nodes are split, merged and moved ─────────────────────────────────
  { id: 'morph-splits-text-around-a-new-inline-element', src: 'vue:rendererChildren#mixed', from: '<p>abc</p>', to: '<p>a<b>b</b>c</p>', expected: '<p>a<b>b</b>c</p>' },
  { id: 'morph-merges-an-inline-run-back-to-plain-text', src: 'janux', from: '<p>a<b>b</b>c</p>', to: '<p>abc</p>', expected: '<p>abc</p>' },
  { id: 'morph-updates-a-text-node-between-two-reused-elements', src: 'janux', from: '<p>a</p>mid<p>b</p>', to: '<p>a</p>changed<p>b</p>', expected: '<p>a</p>changed<p>b</p>' },
  { id: 'morph-inserting-leading-text-shifts-index-matches', src: 'preact:keys#unkeyed-insert', from: '<p>x</p>', to: 'lead<p>x</p>', expected: 'lead<p>x</p>' },
  { id: 'morph-drops-trailing-text-after-the-last-element', src: 'janux', from: '<p>x</p>tail', to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-keeps-a-whitespace-only-text-node-between-siblings', src: 'janux', from: '<p>a</p> <p>b</p>', to: '<p>a</p> <p>c</p>', expected: '<p>a</p> <p>c</p>' },
  { id: 'morph-keeps-markup-entities-escaped-through-a-text-update', src: 'react:escapeTextForBrowser', from: '<p>safe</p>', to: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', expected: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>' },
  { id: 'morph-shrinks-a-long-text-to-a-short-one', src: 'janux', from: '<p>a much longer piece of copy</p>', to: '<p>ok</p>', expected: '<p>ok</p>' },
  { id: 'morph-updates-text-to-a-falsy-looking-zero', src: 'janux', from: '<p>1</p>', to: '<p>0</p>', expected: '<p>0</p>' },
  { id: 'morph-turns-one-text-node-into-several-siblings', src: 'janux', from: 'solo', to: 'a<i>b</i>c<i>d</i>', expected: 'a<i>b</i>c<i>d</i>' },

  // ── comments are first-class nodes ─────────────────────────────────────────
  { id: 'morph-removes-a-comment-the-new-render-dropped', src: 'janux', from: '<p>a</p><!--note-->', to: '<p>a</p>', expected: '<p>a</p>' },
  { id: 'morph-inserts-a-comment-between-elements', src: 'janux', from: '<p>a</p><p>b</p>', to: '<p>a</p><!--between--><p>b</p>', expected: '<p>a</p><!--between--><p>b</p>' },
  { id: 'morph-replaces-a-comment-with-an-element', src: 'janux', from: '<!--placeholder-->', to: '<p>real</p>', expected: '<p>real</p>' },
  { id: 'morph-replaces-an-element-with-a-comment', src: 'janux', from: '<p>real</p>', to: '<!--gone-->', expected: '<!--gone-->' },
  { id: 'morph-replaces-text-with-a-comment-on-a-node-type-change', src: 'janux', from: 'visible', to: '<!--hidden-->', expected: '<!--hidden-->' },
  { id: 'morph-leaves-an-identical-comment-alone', src: 'janux', from: '<!--same--><p>a</p>', to: '<!--same--><p>b</p>', expected: '<!--same--><p>b</p>' },
  { id: 'morph-empties-a-comment-body', src: 'janux', from: '<!--had text-->', to: '<!---->', expected: '<!---->' },

  // ── composite patches: attrs and children in the same pass ─────────────────
  { id: 'morph-changes-an-attribute-and-prepends-a-child-together', src: 'janux', from: '<div class="x"><p>a</p></div>', to: '<div class="y"><span>s</span><p>a</p></div>', expected: '<div class="y"><span>s</span><p>a</p></div>' },
  { id: 'morph-swaps-a-child-kind-while-the-parent-attr-changes', src: 'janux', from: '<div id="a"><p>x</p></div>', to: '<div id="b"><span>x</span></div>', expected: '<div id="b"><span>x</span></div>' },
  { id: 'morph-does-not-match-plain-elements-by-id', src: 'janux', from: '<div id="a"><p>1</p></div><div id="b"><p>2</p></div>', to: '<div id="b"><p>2</p></div><div id="a"><p>1</p></div>', expected: '<div id="b"><p>2</p></div><div id="a"><p>1</p></div>' },

  // ── tables parse through special insertion modes ───────────────────────────
  { id: 'morph-appends-a-table-row', src: 'vue:rendererChildren#table', from: '<table><tbody><tr><td>1</td></tr></tbody></table>', to: '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>', expected: '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>' },
  { id: 'morph-updates-one-cell-through-the-whole-table-chain', src: 'janux', from: '<table><tbody><tr><td>old</td><td>keep</td></tr></tbody></table>', to: '<table><tbody><tr><td>new</td><td>keep</td></tr></tbody></table>', expected: '<table><tbody><tr><td>new</td><td>keep</td></tr></tbody></table>' },
  { id: 'morph-keeps-thead-while-tbody-rows-change', src: 'janux', from: '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>', to: '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>', expected: '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>' },
  { id: 'morph-removes-a-middle-table-row-by-index-shift', src: 'janux', from: '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>', to: '<table><tbody><tr><td>1</td></tr><tr><td>3</td></tr></tbody></table>', expected: '<table><tbody><tr><td>1</td></tr><tr><td>3</td></tr></tbody></table>' },
  { id: 'morph-turns-a-td-into-a-th-by-replacement', src: 'janux', from: '<table><tbody><tr><td>x</td></tr></tbody></table>', to: '<table><tbody><tr><th>x</th></tr></tbody></table>', expected: '<table><tbody><tr><th>x</th></tr></tbody></table>' },
  { id: 'morph-adds-a-caption-before-the-body', src: 'janux', from: '<table><tbody><tr><td>x</td></tr></tbody></table>', to: '<table><caption>c</caption><tbody><tr><td>x</td></tr></tbody></table>', expected: '<table><caption>c</caption><tbody><tr><td>x</td></tr></tbody></table>' },

  // ── lists and other grouped structures ─────────────────────────────────────
  { id: 'morph-replaces-a-ul-with-an-ol-wholesale', src: 'vue:rendererChildren#different-tag-nested', from: '<ul><li>a</li><li>b</li></ul>', to: '<ol><li>a</li><li>b</li></ol>', expected: '<ol><li>a</li><li>b</li></ol>' },
  { id: 'morph-inserting-a-different-tag-mid-list-cascades-replacements', src: 'preact:keys#unkeyed-type-change', from: '<dt>a</dt><dd>1</dd>', to: '<dt>a</dt><dt>b</dt><dd>1</dd>', expected: '<dt>a</dt><dt>b</dt><dd>1</dd>' },
  { id: 'morph-grows-nesting-depth-one-level-at-a-time', src: 'janux', from: '<div><div>x</div></div>', to: '<div><div><div>x</div></div></div>', expected: '<div><div><div>x</div></div></div>' },
  { id: 'morph-shrinks-a-five-item-list-to-two', src: 'janux', from: '<li>1</li><li>2</li><li>3</li><li>4</li><li>5</li>', to: '<li>1</li><li>2</li>', expected: '<li>1</li><li>2</li>' },
  { id: 'morph-rewrites-every-slot-when-node-types-rotate', src: 'janux', from: '<!--c-->text<p>e</p>', to: 'text<!--c--><p>e</p>', expected: 'text<!--c--><p>e</p>' },
  { id: 'morph-keeps-an-optgroup-while-its-options-change', src: 'janux', from: '<select><optgroup label="g"><option>a</option></optgroup></select>', to: '<select><optgroup label="g"><option>b</option></optgroup></select>', expected: '<select><optgroup label="g"><option>b</option></optgroup></select>' },
  { id: 'morph-adds-an-option-to-an-existing-select', src: 'janux', from: '<select><option>a</option></select>', to: '<select><option>a</option><option>b</option></select>', expected: '<select><option>a</option><option>b</option></select>' },

  // ── void and raw-text elements ─────────────────────────────────────────────
  { id: 'morph-inserts-an-hr-between-paragraphs', src: 'janux', from: '<p>a</p><p>b</p>', to: '<p>a</p><hr><p>b</p>', expected: '<p>a</p><hr><p>b</p>' },
  { id: 'morph-replaces-an-img-with-a-br-on-a-void-tag-change', src: 'janux', from: '<img src="x.png">', to: '<br>', expected: '<br>' },
  { id: 'morph-a-void-element-never-gains-children', src: 'janux', from: '<br>', to: '<br class="wide">', expected: '<br class="wide">' },
  { id: 'morph-preserves-newlines-inside-pre', src: 'janux', from: '<pre>line1\nline2</pre>', to: '<pre>line1\nchanged</pre>', expected: '<pre>line1\nchanged</pre>' },
  { id: 'morph-updates-inline-script-text-without-a-tag-change', src: 'janux', from: '<script>var a=1</script>', to: '<script>var a=2</script>', expected: '<script>var a=2</script>' },
  { id: 'morph-updates-style-element-css-text', src: 'janux', from: '<style>p{color:red}</style>', to: '<style>p{color:blue}</style>', expected: '<style>p{color:blue}</style>' },
  { id: 'morph-replaces-a-script-with-a-div-on-a-tag-change', src: 'janux', from: '<script>var x=1</script>', to: '<div>plain</div>', expected: '<div>plain</div>' },

  // ── custom elements are ordinary unless they are janux boundaries ──────────
  { id: 'morph-patches-inside-a-non-janux-custom-element', src: 'janux', from: '<x-widget size="s"><p>old</p></x-widget>', to: '<x-widget size="l"><p>new</p></x-widget>', expected: '<x-widget size="l"><p>new</p></x-widget>' },
  { id: 'morph-replaces-across-two-different-custom-tags', src: 'janux', from: '<x-a>one</x-a>', to: '<x-b>one</x-b>', expected: '<x-b>one</x-b>' },

  // ── svg: namespace and case-preserving names ───────────────────────────────
  { id: 'morph-updates-an-svg-shape-attribute-in-place', src: 'diff-dom-streaming:index#svg-path', from: '<svg><circle r="1"></circle></svg>', to: '<svg><circle r="2"></circle></svg>', expected: '<svg><circle r="2"></circle></svg>' },
  { id: 'morph-replaces-svg-with-html-on-a-tag-change', src: 'janux', from: '<svg><rect></rect></svg>', to: '<div>flat</div>', expected: '<div>flat</div>' },
  { id: 'morph-replaces-html-with-svg-on-a-tag-change', src: 'janux', from: '<div>flat</div>', to: '<svg><rect></rect></svg>', expected: '<svg><rect></rect></svg>' },
  { id: 'morph-adds-a-second-shape-inside-an-svg-group', src: 'janux', from: '<svg><g><rect width="1"></rect></g></svg>', to: '<svg><g><rect width="1"></rect><circle r="3"></circle></g></svg>', expected: '<svg><g><rect width="1"></rect><circle r="3"></circle></g></svg>' },
  { id: 'morph-updates-svg-text-content', src: 'janux', from: '<svg><text>old</text></svg>', to: '<svg><text>new</text></svg>', expected: '<svg><text>new</text></svg>' },
  { id: 'morph-swaps-shape-kinds-inside-svg', src: 'janux', from: '<svg><rect width="4"></rect></svg>', to: '<svg><ellipse rx="4"></ellipse></svg>', expected: '<svg><ellipse rx="4"></ellipse></svg>' },

  // ── the root's own children list edge cases ────────────────────────────────
  { id: 'morph-a-single-child-replaced-by-many', src: 'janux', from: '<p>only</p>', to: '<p>1</p><p>2</p><p>3</p>', expected: '<p>1</p><p>2</p><p>3</p>' },
  { id: 'morph-many-children-collapse-to-one', src: 'janux', from: '<p>1</p><p>2</p><p>3</p>', to: '<p>only</p>', expected: '<p>only</p>' },
  { id: 'morph-first-and-last-swap-content-by-index', src: 'preact:keys#unkeyed-swap', from: '<p>first</p><p>mid</p><p>last</p>', to: '<p>last</p><p>mid</p><p>first</p>', expected: '<p>last</p><p>mid</p><p>first</p>' },
  { id: 'morph-identical-trees-leave-the-markup-intact', src: 'janux', from: '<div><p>a</p><span>b</span></div>', to: '<div><p>a</p><span>b</span></div>', expected: '<div><p>a</p><span>b</span></div>' },

  // ── media and embedded content ─────────────────────────────────────────────
  { id: 'morph-swaps-a-video-source-src-in-place', src: 'janux', from: '<video><source src="a.mp4"></video>', to: '<video><source src="b.mp4"></video>', expected: '<video><source src="b.mp4"></video>' },
  { id: 'morph-updates-a-picture-source-media-query-and-reuses-the-img', src: 'janux', from: '<picture><source media="(min-width: 600px)"><img src="s.png"></picture>', to: '<picture><source media="(min-width: 800px)"><img src="s.png"></picture>', expected: '<picture><source media="(min-width: 800px)"><img src="s.png"></picture>' },
  { id: 'morph-reuses-an-iframe-across-a-src-change', src: 'janux', from: '<iframe src="/a" title="frame"></iframe>', to: '<iframe src="/b" title="frame"></iframe>', expected: '<iframe src="/b" title="frame"></iframe>' },

  // ── composite passes across levels ─────────────────────────────────────────
  { id: 'morph-changes-a-list-attribute-while-its-items-rewrite', src: 'janux', from: '<ol start="1"><li>a</li><li>b</li></ol>', to: '<ol start="5"><li>x</li><li>y</li></ol>', expected: '<ol start="5"><li>x</li><li>y</li></ol>' },
  { id: 'morph-updates-a-col-span-inside-a-colgroup', src: 'janux', from: '<table><colgroup><col span="1"></colgroup><tbody><tr><td>x</td></tr></tbody></table>', to: '<table><colgroup><col span="2"></colgroup><tbody><tr><td>x</td></tr></tbody></table>', expected: '<table><colgroup><col span="2"></colgroup><tbody><tr><td>x</td></tr></tbody></table>' },
  { id: 'morph-inserts-a-legend-as-the-first-fieldset-child', src: 'janux', from: '<fieldset><input></fieldset>', to: '<fieldset><legend>l</legend><input></fieldset>', expected: '<fieldset><legend>l</legend><input></fieldset>' },
  { id: 'morph-updates-text-element-text-around-an-inline-node', src: 'janux', from: 'a<b>x</b>c', to: 'a2<b>x2</b>c2', expected: 'a2<b>x2</b>c2' },
  { id: 'morph-syncs-a-form-flag-and-a-nested-input-attr-in-one-pass', src: 'janux', from: '<form><input required=""></form>', to: '<form novalidate=""><input></form>', expected: '<form novalidate=""><input></form>' },
  { id: 'morph-rotating-three-different-tags-rewrites-each-slot', src: 'janux', from: '<main>m</main><nav>n</nav><aside>a</aside>', to: '<nav>n</nav><aside>a</aside><main>m</main>', expected: '<nav>n</nav><aside>a</aside><main>m</main>' },
  { id: 'morph-grows-a-definition-list-by-a-pair', src: 'janux', from: '<dl><dt>a</dt><dd>1</dd></dl>', to: '<dl><dt>a</dt><dd>1</dd><dt>b</dt><dd>2</dd></dl>', expected: '<dl><dt>a</dt><dd>1</dd><dt>b</dt><dd>2</dd></dl>' },
  { id: 'morph-a-ten-level-chain-only-touches-the-leaf', src: 'janux', from: '<div><div><div><div><div><div><div><div><div><em>old</em></div></div></div></div></div></div></div></div></div>', to: '<div><div><div><div><div><div><div><div><div><em>new</em></div></div></div></div></div></div></div></div></div>', expected: '<div><div><div><div><div><div><div><div><div><em>new</em></div></div></div></div></div></div></div></div></div>' },
  { id: 'morph-elements-update-while-interleaved-comments-hold', src: 'janux', from: '<!--a--><p>1</p><!--b--><p>2</p>', to: '<!--a--><p>one</p><!--b--><p>two</p>', expected: '<!--a--><p>one</p><!--b--><p>two</p>' },

  // ── text-level markup and entities ─────────────────────────────────────────
  { id: 'morph-splits-a-text-with-a-line-break-element', src: 'janux', from: '<p>a b</p>', to: '<p>a<br>b</p>', expected: '<p>a<br>b</p>' },
  { id: 'morph-keeps-a-non-breaking-space-entity-through-an-update', src: 'janux', from: '<p>a b</p>', to: '<p>a&nbsp;b</p>', expected: '<p>a&nbsp;b</p>' },
  { id: 'morph-updates-emoji-text-by-code-point', src: 'janux', from: '<p>mood: 🙂</p>', to: '<p>mood: 🎉</p>', expected: '<p>mood: 🎉</p>' },
  { id: 'morph-flips-direction-and-text-together', src: 'janux', from: '<p dir="ltr">hello</p>', to: '<p dir="rtl">שלום</p>', expected: '<p dir="rtl">שלום</p>' },
  { id: 'morph-updates-a-body-hosted-link-rel', src: 'janux', from: '<link rel="preload" href="/f.woff2">', to: '<link rel="prefetch" href="/f.woff2">', expected: '<link rel="prefetch" href="/f.woff2">' },
  { id: 'morph-syncs-a-textarea-placeholder-and-content-together', src: 'janux', from: '<textarea placeholder="say hi">old</textarea>', to: '<textarea placeholder="say more">new</textarea>', expected: '<textarea placeholder="say more">new</textarea>' },

  // ── deep svg structures ────────────────────────────────────────────────────
  { id: 'morph-updates-gradient-stops-inside-svg-defs', src: 'janux', from: '<svg><defs><linearGradient id="g"><stop offset="0%"></stop></linearGradient></defs></svg>', to: '<svg><defs><linearGradient id="g"><stop offset="50%"></stop></linearGradient></defs></svg>', expected: '<svg><defs><linearGradient id="g"><stop offset="50%"></stop></linearGradient></defs></svg>' },
  { id: 'morph-patches-html-inside-an-svg-foreignobject', src: 'janux', from: '<svg><foreignObject><div>a</div></foreignObject></svg>', to: '<svg><foreignObject><div>b</div></foreignObject></svg>', expected: '<svg><foreignObject><div>b</div></foreignObject></svg>' },
];
