import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * The tags HTML parses as raw text (`script`, `style`, `title`, `textarea`,
 * `xmp`, `plaintext`) get NO special treatment from Janux: children are
 * escaped exactly like everywhere else, and `dangerHTML` is the one raw door.
 *
 * That is a deliberate divergence from React/Vue, which emit `<script>`
 * children verbatim: an escaped `</script>` cannot terminate the block early,
 * so interpolated data can never continue as markup — consistent with the
 * stance in `security/escaping.cases.ts`. The cost is that JSX children are
 * not a way to write inline code; `dangerHTML` (nonce-aware, see the CSP
 * shell) is.
 */
const raw = (tag: string, children: unknown) => jsx(tag, { children });

export const RAW_TEXT_CASES: TreeRow[] = [
  // ── script: escaped children, raw dangerHTML ────────────────────────────────
  { id: 'rawtext-script-children-are-escaped', src: 'janux', node: () => raw('script', 'if (a < b) go()'), expected: '<script>if (a &lt; b) go()</script>' },
  { id: 'rawtext-script-closing-tag-in-children-cannot-terminate-it', src: 'janux', node: () => raw('script', '</script><b>out</b>'), expected: '<script>&lt;/script&gt;&lt;b&gt;out&lt;/b&gt;</script>' },
  { id: 'rawtext-script-json-children-escape-quotes-too', src: 'janux', node: () => jsx('script', { type: 'application/json', children: '{"a":"<x>"}' }), expected: '<script type="application/json">{&quot;a&quot;:&quot;&lt;x&gt;&quot;}</script>' },
  { id: 'rawtext-script-number-child-renders-as-text', src: 'janux', node: () => raw('script', 42), expected: '<script>42</script>' },
  { id: 'rawtext-script-dangerhtml-is-the-raw-door', src: 'janux', node: () => jsx('script', { dangerHTML: 'if (a < b) go()' }), expected: '<script>if (a < b) go()</script>' },
  { id: 'rawtext-script-with-src-and-no-children', src: 'janux', node: () => jsx('script', { src: '/a.js' }), expected: '<script src="/a.js"></script>' },
  { id: 'rawtext-script-nonce-prop-is-an-ordinary-attribute', src: 'janux', node: () => jsx('script', { nonce: 'abc', children: 'x' }), expected: '<script nonce="abc">x</script>' },

  // ── style: same rule ────────────────────────────────────────────────────────
  { id: 'rawtext-style-children-escape-combinators', src: 'janux', node: () => raw('style', 'a > b { color: red }'), expected: '<style>a &gt; b { color: red }</style>' },
  { id: 'rawtext-style-closing-tag-in-children-cannot-terminate-it', src: 'janux', node: () => raw('style', '</style><script>x</script>'), expected: '<style>&lt;/style&gt;&lt;script&gt;x&lt;/script&gt;</style>' },
  { id: 'rawtext-style-attribute-selector-quotes-are-escaped', src: 'janux', node: () => raw('style', '[data-x="1"] { color: red }'), expected: '<style>[data-x=&quot;1&quot;] { color: red }</style>' },
  { id: 'rawtext-style-dangerhtml-emits-css-verbatim', src: 'janux', node: () => jsx('style', { dangerHTML: 'a > b { color: red }' }), expected: '<style>a > b { color: red }</style>' },
  { id: 'rawtext-style-media-attribute-rides-along', src: 'janux', node: () => jsx('style', { media: 'print', children: 'p { margin: 0 }' }), expected: '<style media="print">p { margin: 0 }</style>' },

  // ── title and textarea ──────────────────────────────────────────────────────
  { id: 'rawtext-title-escapes-its-ampersand', src: 'react:Elements#title-text', node: () => raw('title', 'A & B'), expected: '<title>A &amp; B</title>' },
  { id: 'rawtext-title-markup-child-is-escaped', src: 'janux', node: () => raw('title', '<i>hi</i>'), expected: '<title>&lt;i&gt;hi&lt;/i&gt;</title>' },
  { id: 'rawtext-textarea-children-are-its-escaped-value', src: 'react:Forms#textarea-children', node: () => raw('textarea', '<b>x</b>'), expected: '<textarea>&lt;b&gt;x&lt;/b&gt;</textarea>' },
  { id: 'rawtext-textarea-preserves-its-newlines', src: 'janux', node: () => raw('textarea', 'line1\nline2\n'), expected: '<textarea>line1\nline2\n</textarea>' },
  // React moves `value` into the children; Janux keeps it an attribute.
  { id: 'rawtext-textarea-value-stays-an-attribute', src: 'janux', node: () => jsx('textarea', { value: 'x' }), expected: '<textarea value="x"></textarea>' },
  { id: 'rawtext-textarea-number-child-renders-as-text', src: 'janux', node: () => raw('textarea', 42), expected: '<textarea>42</textarea>' },

  // ── legacy raw-text tags follow the same rule ───────────────────────────────
  { id: 'rawtext-xmp-children-are-escaped', src: 'janux', node: () => raw('xmp', '<b>'), expected: '<xmp>&lt;b&gt;</xmp>' },
  { id: 'rawtext-plaintext-children-are-escaped', src: 'janux', node: () => raw('plaintext', '<b>'), expected: '<plaintext>&lt;b&gt;</plaintext>' },

  // ── containers that are NOT raw text render children normally ───────────────
  { id: 'rawtext-noscript-children-render-as-elements', src: 'janux', node: () => raw('noscript', jsx('img', { src: 'a.png' })), expected: '<noscript><img src="a.png"/></noscript>' },
  { id: 'rawtext-iframe-children-are-rendered-not-dropped', src: 'janux', node: () => raw('iframe', jsx('p', { children: 'fallback' })), expected: '<iframe><p>fallback</p></iframe>' },
  { id: 'rawtext-template-children-render-inline', src: 'janux', node: () => raw('template', jsx('b', { children: 'x' })), expected: '<template><b>x</b></template>' },
  { id: 'rawtext-template-dangerhtml-is-raw', src: 'janux', node: () => jsx('template', { dangerHTML: '<tr><td>1</td></tr>' }), expected: '<template><tr><td>1</td></tr></template>' },

  // ── whitespace-significant containers ───────────────────────────────────────
  { id: 'rawtext-pre-preserves-indentation-and-newlines', src: 'janux', node: () => raw('pre', '\n  a\n    b\n'), expected: '<pre>\n  a\n    b\n</pre>' },

  // ── markup-shaped text is inert everywhere ──────────────────────────────────
  { id: 'rawtext-comment-shaped-child-is-escaped', src: 'janux', node: () => raw('div', '<!-- x -->'), expected: '<div>&lt;!-- x --&gt;</div>' },
  { id: 'rawtext-cdata-shaped-child-is-escaped', src: 'janux', node: () => raw('div', '<![CDATA[x]]>'), expected: '<div>&lt;![CDATA[x]]&gt;</div>' },
  { id: 'rawtext-doctype-shaped-child-is-escaped', src: 'janux', node: () => raw('div', '<!DOCTYPE html>'), expected: '<div>&lt;!DOCTYPE html&gt;</div>' },
  { id: 'rawtext-dangerhtml-can-emit-a-real-comment', src: 'janux', node: () => jsx('div', { dangerHTML: '<!-- note -->' }), expected: '<div><!-- note --></div>' },
];
