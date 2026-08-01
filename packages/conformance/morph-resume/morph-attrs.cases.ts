import type { MorphRow } from './morph.cases';

/**
 * DOM patching, attribute corpus. `syncAttrs` removes what the new render
 * dropped, writes what changed, and re-adds runtime-owned `janux-*` classes on
 * top — these rows pin down each attribute *kind* that behaves differently:
 * boolean attributes that reflect element state, `class` with the runtime
 * carve-out, `style` as a serialized string, SVG's case-sensitive names,
 * colon-prefixed legacy names, and values that need escaping to survive a
 * serialize round-trip. Kept attributes keep their position; added ones
 * append in incoming order — both facts are what `innerHTML` asserts.
 */

export const MORPH_ATTR_CASES: MorphRow[] = [
  // ── add/remove/keep ordering facts ─────────────────────────────────────────
  { id: 'morph-appends-new-attributes-after-kept-ones', src: 'janux', from: '<p title="t">x</p>', to: '<p id="a" title="t">x</p>', expected: '<p title="t" id="a">x</p>' },
  { id: 'morph-adds-several-attributes-in-incoming-order', src: 'janux', from: '<p>x</p>', to: '<p id="a" title="t" lang="en">x</p>', expected: '<p id="a" title="t" lang="en">x</p>' },
  { id: 'morph-removes-one-of-three-attributes', src: 'janux', from: '<p id="a" title="t" lang="en">x</p>', to: '<p id="a" lang="en">x</p>', expected: '<p id="a" lang="en">x</p>' },
  { id: 'morph-swaps-two-attribute-values-without-reordering-them', src: 'janux', from: '<p id="one" title="two">x</p>', to: '<p title="one" id="two">x</p>', expected: '<p id="two" title="one">x</p>' },

  // ── boolean attributes reflect element state ───────────────────────────────
  { id: 'morph-adds-the-checked-attribute-to-a-checkbox', src: 'morphdom:specialElHandlers#checked-attr', from: '<input type="checkbox">', to: '<input type="checkbox" checked="">', expected: '<input type="checkbox" checked="">' },
  { id: 'morph-removes-the-selected-attribute-from-an-option', src: 'janux', from: '<select><option selected="">a</option><option>b</option></select>', to: '<select><option>a</option><option selected="">b</option></select>', expected: '<select><option>a</option><option selected="">b</option></select>' },
  { id: 'morph-opens-a-details-element-via-attribute', src: 'janux', from: '<details><summary>s</summary>body</details>', to: '<details open=""><summary>s</summary>body</details>', expected: '<details open=""><summary>s</summary>body</details>' },
  { id: 'morph-closes-a-details-element-by-dropping-open', src: 'janux', from: '<details open=""><summary>s</summary>body</details>', to: '<details><summary>s</summary>body</details>', expected: '<details><summary>s</summary>body</details>' },
  { id: 'morph-hides-an-element-via-the-hidden-attribute', src: 'janux', from: '<p>x</p>', to: '<p hidden="">x</p>', expected: '<p hidden="">x</p>' },
  { id: 'morph-disables-a-whole-fieldset', src: 'janux', from: '<fieldset><input></fieldset>', to: '<fieldset disabled=""><input></fieldset>', expected: '<fieldset disabled=""><input></fieldset>' },
  { id: 'morph-makes-an-input-readonly-and-back', src: 'janux', from: '<input readonly="">', to: '<input>', expected: '<input>' },

  // ── class: plain part is the view's, janux- prefix is the runtime's ────────
  { id: 'morph-removes-the-class-attribute-when-no-runtime-class-holds-it', src: 'janux', from: '<p class="a b">x</p>', to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-keeps-a-runtime-class-on-a-nested-descendant', src: 'janux', from: '<div><p class="janux-glow">x</p></div>', to: '<div><p>y</p></div>', expected: '<div><p class="janux-glow">y</p></div>' },
  { id: 'morph-keeps-a-runtime-class-when-the-class-attr-is-unchanged', src: 'janux', from: '<p class="a janux-glow">x</p>', to: '<p class="a">y</p>', expected: '<p class="a janux-glow">y</p>' },
  { id: 'morph-does-not-treat-a-janux-substring-class-as-runtime-owned', src: 'janux', from: '<p class="not-janux-glow">x</p>', to: '<p class="v">y</p>', expected: '<p class="v">y</p>' },
  { id: 'morph-does-not-treat-an-unprefixed-janux-class-as-runtime-owned', src: 'janux', from: '<p class="janux">x</p>', to: '<p class="v">y</p>', expected: '<p class="v">y</p>' },
  { id: 'morph-a-view-rendered-janux-class-syncs-like-any-class', src: 'janux', from: '<p>x</p>', to: '<p class="janux-tint">x</p>', expected: '<p class="janux-tint">x</p>' },
  { id: 'morph-merges-a-view-class-under-an-existing-runtime-class', src: 'janux', from: '<p class="janux-busy">x</p>', to: '<p class="loaded">x</p>', expected: '<p class="loaded janux-busy">x</p>' },
  { id: 'morph-dedupes-a-runtime-class-the-view-also-renders', src: 'janux', from: '<p class="janux-glow">x</p>', to: '<p class="janux-glow off">x</p>', expected: '<p class="janux-glow off">x</p>' },

  // ── style is one serialized string ─────────────────────────────────────────
  { id: 'morph-updates-an-inline-style-string', src: 'janux', from: '<p style="color: red;">x</p>', to: '<p style="color: blue;">x</p>', expected: '<p style="color: blue;">x</p>' },
  { id: 'morph-removes-the-style-attribute-entirely', src: 'janux', from: '<p style="color: red;">x</p>', to: '<p>x</p>', expected: '<p>x</p>' },
  { id: 'morph-adds-a-multi-declaration-style', src: 'janux', from: '<p>x</p>', to: '<p style="color: red; margin: 0;">x</p>', expected: '<p style="color: red; margin: 0;">x</p>' },

  // ── value kinds that need escaping or exact bytes ──────────────────────────
  { id: 'morph-escapes-quotes-inside-an-attribute-value', src: 'react:escapeTextForBrowser#attr', from: '<p title="plain">x</p>', to: '<p title="say &quot;hi&quot;">x</p>', expected: '<p title="say &quot;hi&quot;">x</p>' },
  { id: 'morph-keeps-an-ampersand-escaped-in-an-attribute', src: 'janux', from: '<a href="/a">x</a>', to: '<a href="/a?b=1&amp;c=2">x</a>', expected: '<a href="/a?b=1&amp;c=2">x</a>' },
  { id: 'morph-syncs-a-unicode-attribute-value', src: 'janux', from: '<p title="hola">x</p>', to: '<p title="día 🎉">x</p>', expected: '<p title="día 🎉">x</p>' },
  { id: 'morph-updates-an-attribute-whose-value-is-whitespace', src: 'janux', from: '<p data-pad="a">x</p>', to: '<p data-pad="  ">x</p>', expected: '<p data-pad="  ">x</p>' },
  { id: 'morph-a-value-differing-only-in-case-is-a-real-change', src: 'janux', from: '<p data-mode="Dark">x</p>', to: '<p data-mode="dark">x</p>', expected: '<p data-mode="dark">x</p>' },
  { id: 'morph-updates-a-relative-href-without-resolving-it', src: 'janux', from: '<a href="./a">x</a>', to: '<a href="../b">x</a>', expected: '<a href="../b">x</a>' },
  { id: 'morph-syncs-a-srcset-descriptor-list-verbatim', src: 'janux', from: '<img srcset="a.png 1x">', to: '<img srcset="a.png 1x, b.png 2x">', expected: '<img srcset="a.png 1x, b.png 2x">' },

  // ── name families with their own rules ─────────────────────────────────────
  { id: 'morph-updates-a-case-sensitive-svg-attribute', src: 'vue:patchAttr#svg-case', from: '<svg viewBox="0 0 1 1"><rect></rect></svg>', to: '<svg viewBox="0 0 2 2"><rect></rect></svg>', expected: '<svg viewBox="0 0 2 2"><rect></rect></svg>' },
  { id: 'morph-adds-a-colon-prefixed-legacy-name', src: 'janux', from: '<svg><use></use></svg>', to: '<svg><use xlink:href="#icon"></use></svg>', expected: '<svg><use xlink:href="#icon"></use></svg>' },
  { id: 'morph-removes-a-colon-prefixed-legacy-name', src: 'janux', from: '<svg><use xlink:href="#icon"></use></svg>', to: '<svg><use></use></svg>', expected: '<svg><use></use></svg>' },
  { id: 'morph-syncs-an-event-handler-looking-attribute-as-inert-text', src: 'janux', from: '<button onclick="a()">x</button>', to: '<button onclick="b()">x</button>', expected: '<button onclick="b()">x</button>' },
  { id: 'morph-updates-a-data-attribute-with-a-json-payload', src: 'janux', from: `<div data-cfg='{"a":1}'>x</div>`, to: `<div data-cfg='{"a":2}'>x</div>`, expected: `<div data-cfg="{&quot;a&quot;:2}">x</div>` },
  { id: 'morph-syncs-data-jx-on-a-plain-element-that-is-no-boundary', src: 'janux', from: '<div data-jx="fake#1">x</div>', to: '<div data-jx="fake#2">y</div>', expected: '<div data-jx="fake#2">y</div>' },
  { id: 'morph-updates-an-aria-relationship-id-list', src: 'janux', from: '<p aria-describedby="a">x</p>', to: '<p aria-describedby="a b">x</p>', expected: '<p aria-describedby="a b">x</p>' },
  { id: 'morph-flips-an-enumerated-attribute-value', src: 'janux', from: '<p contenteditable="true">x</p>', to: '<p contenteditable="false">x</p>', expected: '<p contenteditable="false">x</p>' },
  { id: 'morph-syncs-the-slot-attribute-like-any-other', src: 'janux', from: '<span slot="head">x</span>', to: '<span slot="tail">x</span>', expected: '<span slot="tail">x</span>' },
  { id: 'morph-changes-an-input-type-in-place', src: 'morphdom:specialElHandlers#type-change', from: '<input type="text">', to: '<input type="password">', expected: '<input type="password">' },
  { id: 'morph-updates-the-value-attribute-not-just-the-property', src: 'janux', from: '<input value="a">', to: '<input value="b">', expected: '<input value="b">' },
  { id: 'morph-syncs-an-attribute-on-a-deeply-nested-node-only', src: 'janux', from: '<div><ul><li><a href="/old">x</a></li></ul></div>', to: '<div><ul><li><a href="/new">x</a></li></ul></div>', expected: '<div><ul><li><a href="/new">x</a></li></ul></div>' },
  { id: 'morph-drops-every-data-attribute-of-a-group-at-once', src: 'janux', from: '<div data-a="1" data-b="2" data-c="3">x</div>', to: '<div>x</div>', expected: '<div>x</div>' },
  { id: 'morph-a-number-valued-attribute-updates-as-text', src: 'janux', from: '<textarea rows="2">x</textarea>', to: '<textarea rows="4">x</textarea>', expected: '<textarea rows="4">x</textarea>' },
  { id: 'morph-updates-a-meta-like-name-content-pair', src: 'janux', from: '<meta name="x" content="1">', to: '<meta name="x" content="2">', expected: '<meta name="x" content="2">' },
  { id: 'morph-syncs-tabindex-changes', src: 'janux', from: '<span tabindex="0">x</span>', to: '<span tabindex="-1">x</span>', expected: '<span tabindex="-1">x</span>' },
  { id: 'morph-an-unchanged-case-sensitive-name-is-not-clobbered-by-a-neighbour', src: 'janux', from: '<svg viewBox="0 0 1 1" class="a"><rect></rect></svg>', to: '<svg viewBox="0 0 1 1" class="b"><rect></rect></svg>', expected: '<svg viewBox="0 0 1 1" class="b"><rect></rect></svg>' },
  { id: 'morph-keeps-a-newline-inside-an-attribute-value', src: 'janux', from: '<p data-note="one">x</p>', to: '<p data-note="one\ntwo">x</p>', expected: '<p data-note="one\ntwo">x</p>' },
  { id: 'morph-syncs-a-dozen-attributes-in-one-pass', src: 'janux', from: '<div a="1" b="1" c="1" d="1" e="1" f="1">x</div>', to: '<div a="2" b="2" c="2" d="2" e="2" f="2" g="2" h="2" i="2" j="2" k="2" l="2">x</div>', expected: '<div a="2" b="2" c="2" d="2" e="2" f="2" g="2" h="2" i="2" j="2" k="2" l="2">x</div>' },
  { id: 'morph-a-reordered-class-token-list-is-a-value-change', src: 'janux', from: '<p class="a b c">x</p>', to: '<p class="c b a">x</p>', expected: '<p class="c b a">x</p>' },
  { id: 'morph-updates-a-style-with-a-url-function-value', src: 'janux', from: `<div style="background-image: url('/a.png');">x</div>`, to: `<div style="background-image: url('/b.png');">x</div>`, expected: `<div style="background-image: url('/b.png');">x</div>` },
  { id: 'morph-resizes-a-canvas-through-its-attributes', src: 'janux', from: '<canvas width="100" height="50"></canvas>', to: '<canvas width="200" height="80"></canvas>', expected: '<canvas width="200" height="80"></canvas>' },
  { id: 'morph-syncs-autocomplete-across-a-form-and-its-field', src: 'janux', from: '<form autocomplete="on"><input autocomplete="email"></form>', to: '<form autocomplete="off"><input autocomplete="off"></form>', expected: '<form autocomplete="off"><input autocomplete="off"></form>' },
  { id: 'morph-updates-both-length-bounds-of-an-input', src: 'janux', from: '<input minlength="2" maxlength="8">', to: '<input minlength="4" maxlength="6">', expected: '<input minlength="4" maxlength="6">' },
  { id: 'morph-adds-a-lazy-loading-hint-to-an-image', src: 'janux', from: '<img src="a.png">', to: '<img src="a.png" loading="lazy">', expected: '<img src="a.png" loading="lazy">' },
  { id: 'morph-changes-an-explicit-aria-role', src: 'janux', from: '<div role="button">x</div>', to: '<div role="link">x</div>', expected: '<div role="link">x</div>' },
  { id: 'morph-aria-checked-supports-the-mixed-tristate', src: 'janux', from: '<div role="checkbox" aria-checked="false">x</div>', to: '<div role="checkbox" aria-checked="mixed">x</div>', expected: '<div role="checkbox" aria-checked="mixed">x</div>' },
  { id: 'morph-updates-a-rel-token-list-on-an-anchor', src: 'janux', from: '<a href="/x" rel="noopener">x</a>', to: '<a href="/x" rel="noopener noreferrer">x</a>', expected: '<a href="/x" rel="noopener noreferrer">x</a>' },
];
