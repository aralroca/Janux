import type { HeadTag } from 'janux';
import type { Case } from '../support/case';

/**
 * The escape hatch: `meta.head`, for everything the typed fields do not cover.
 *
 * It takes *any* tag, which is why the void set here is the full HTML one and
 * not the head's usual three — a `<meta>` closed with `</meta>` is invalid, and
 * so is a `<br>` that is not.
 *
 * Two rules are load-bearing. Every node gets a stable `id`, defaulting to its
 * index, because the SPA head diff matches by key; an author-supplied `id` wins
 * and, crucially, does not renumber its neighbours. And `style`/`script` are
 * raw text: the browser does not decode entities inside them, so escaping their
 * content corrupts it — a `&` in a CSS nesting selector, a `<` in a media
 * query. Only the closing sequence can end those elements, and only that is
 * neutralised. They also get the request nonce, because the app cannot write
 * one itself: it is minted per request, and without it a strict policy simply
 * refuses the tag.
 */
export interface HeadCustomCase {
  tags: HeadTag[];
  nonce?: string;
  /** Only the escape-hatch part of the output — the cards are asserted elsewhere. */
  expected: string;
}

export type HeadCustomRow = Case<HeadCustomCase>;

export const HEAD_CUSTOM_CASES: HeadCustomRow[] = [
  {
    id: 'head-custom-void-link-is-left-unclosed',
    src: 'janux',
    tags: [{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.test' } }],
    expected: '<link rel="preconnect" href="https://fonts.test" id="jx-head-0">',
  },
  {
    id: 'head-custom-void-meta-is-left-unclosed',
    src: 'janux',
    tags: [{ tag: 'meta', attrs: { name: 'theme-color', content: '#0062ff' } }],
    expected: '<meta name="theme-color" content="#0062ff" id="jx-head-0">',
  },
  {
    id: 'head-custom-void-base-is-left-unclosed',
    src: 'janux',
    tags: [{ tag: 'base', attrs: { href: '/' } }],
    expected: '<base href="/" id="jx-head-0">',
  },
  {
    /** Not a head tag, but the void set is the HTML one, so it still closes correctly. */
    id: 'head-custom-void-set-is-the-full-html-one',
    src: 'janux',
    tags: [{ tag: 'br', attrs: {} }, { tag: 'wbr', attrs: {} }],
    expected: '<br id="jx-head-0"><wbr id="jx-head-1">',
  },
  {
    id: 'head-custom-non-void-tag-is-closed',
    src: 'janux',
    tags: [{ tag: 'noscript', text: 'Enable JavaScript' }],
    expected: '<noscript id="jx-head-0">Enable JavaScript</noscript>',
  },
  {
    id: 'head-custom-missing-text-is-an-empty-element',
    src: 'janux',
    tags: [{ tag: 'template', attrs: { id: 'slot' } }],
    expected: '<template id="slot"></template>',
  },
  {
    /** A void element has no content model, so text on one is simply not written. */
    id: 'head-custom-text-on-a-void-tag-is-ignored',
    src: 'janux',
    tags: [{ tag: 'meta', attrs: { name: 'a' }, text: 'ignored' }],
    expected: '<meta name="a" id="jx-head-0">',
  },
  {
    id: 'head-custom-ids-follow-the-index',
    src: 'janux',
    tags: [{ tag: 'meta', attrs: { name: 'a' } }, { tag: 'meta', attrs: { name: 'b' } }, { tag: 'meta', attrs: { name: 'c' } }],
    expected: '<meta name="a" id="jx-head-0"><meta name="b" id="jx-head-1"><meta name="c" id="jx-head-2">',
  },
  {
    /**
     * An explicit id wins and keeps its authored position among the attributes —
     * and the tags around it keep their index, so adding one never renames another.
     */
    id: 'head-custom-explicit-id-does-not-renumber-its-neighbours',
    src: 'janux',
    tags: [
      { tag: 'meta', attrs: { name: 'a' } },
      { tag: 'meta', attrs: { id: 'mine', name: 'b' } },
      { tag: 'meta', attrs: { name: 'c' } },
    ],
    expected: '<meta name="a" id="jx-head-0"><meta id="mine" name="b"><meta name="c" id="jx-head-2">',
  },
  {
    id: 'head-custom-attribute-order-is-preserved',
    src: 'janux',
    tags: [{ tag: 'link', attrs: { href: '/a.css', rel: 'stylesheet', media: 'print' } }],
    expected: '<link href="/a.css" rel="stylesheet" media="print" id="jx-head-0">',
  },
  {
    id: 'head-custom-empty-attribute-value',
    src: 'janux',
    tags: [{ tag: 'link', attrs: { rel: 'preload', as: '' } }],
    expected: '<link rel="preload" as="" id="jx-head-0">',
  },
  {
    id: 'head-custom-no-attrs-at-all',
    src: 'janux',
    tags: [{ tag: 'title', text: 'Fallback' }],
    expected: '<title id="jx-head-0">Fallback</title>',
  },
  {
    /** A custom element is not in the void set, so it closes like any unknown tag. */
    id: 'head-custom-unknown-element-is-closed',
    src: 'janux',
    tags: [{ tag: 'my-widget', attrs: { value: '1' }, text: 'x' }],
    expected: '<my-widget value="1" id="jx-head-0">x</my-widget>',
  },

  // Escaping.
  {
    id: 'head-custom-attribute-value-cannot-close-the-attribute',
    src: 'janux',
    tags: [{ tag: 'meta', attrs: { name: 'x', content: '" onload="alert(1)' } }],
    expected: '<meta name="x" content="&quot; onload=&quot;alert(1)" id="jx-head-0">',
  },
  {
    id: 'head-custom-attribute-name-is-escaped-too',
    src: 'janux',
    tags: [{ tag: 'meta', attrs: { 'x" onload="alert(1)': 'v' } }],
    expected: '<meta x&quot; onload=&quot;alert(1)="v" id="jx-head-0">',
  },
  {
    id: 'head-custom-tag-name-is-escaped-on-both-ends',
    src: 'janux',
    tags: [{ tag: 'x"<y', attrs: {} }],
    expected: '<x&quot;&lt;y id="jx-head-0"></x&quot;&lt;y>',
  },
  {
    id: 'head-custom-text-is-escaped',
    src: 'janux',
    tags: [{ tag: 'noscript', text: '<img src=x onerror=alert(1)>' }],
    expected: '<noscript id="jx-head-0">&lt;img src=x onerror=alert(1)></noscript>',
  },
  {
    /** `>` cannot start anything, so it is left readable rather than entity-encoded. */
    id: 'head-custom-greater-than-is-left-alone-in-text',
    src: 'janux',
    tags: [{ tag: 'noscript', text: 'a > b & c' }],
    expected: '<noscript id="jx-head-0">a > b &amp; c</noscript>',
  },

  // Raw text elements.
  {
    /** A CSS `&` and a `<` in a media query must arrive intact; only `</style` is neutralised. */
    id: 'head-custom-style-content-is-not-entity-escaped',
    src: 'janux',
    tags: [{ tag: 'style', text: '.a{color:red}.b{&:hover{color:blue}}@media (max-width:10px){.c{d:e}}' }],
    expected: '<style id="jx-head-0">.a{color:red}.b{&:hover{color:blue}}@media (max-width:10px){.c{d:e}}</style>',
  },
  {
    /** An opening `<script` is harmless inside CSS; only the two closing sequences can escape. */
    id: 'head-custom-style-cannot-close-itself',
    src: 'janux',
    tags: [{ tag: 'style', text: '.a{content:"</style><script>alert(1)</script>"}' }],
    expected: '<style id="jx-head-0">.a{content:"<\\/style><script>alert(1)<\\/script>"}</style>',
  },
  {
    id: 'head-custom-script-content-is-not-entity-escaped',
    src: 'janux',
    tags: [{ tag: 'script', text: 'if (a < b && c > d) go("x");' }],
    expected: '<script id="jx-head-0">if (a < b && c > d) go("x");</script>',
  },
  {
    /** Case-insensitive: `</SCRIPT` ends a script just as well as the lowercase spelling. */
    id: 'head-custom-script-close-is-neutralised-case-insensitively',
    src: 'janux',
    tags: [{ tag: 'script', text: 'x = "</SCRIPT>";' }],
    expected: '<script id="jx-head-0">x = "<\\/SCRIPT>";</script>',
  },
  {
    /** Only `</` *followed by a letter* can end an element, so a bare `</` stays readable. */
    id: 'head-custom-lone-slash-is-not-touched',
    src: 'janux',
    tags: [{ tag: 'script', text: 'a </ b < c' }],
    expected: '<script id="jx-head-0">a </ b < c</script>',
  },
  {
    id: 'head-custom-script-gets-the-request-nonce',
    src: 'janux',
    tags: [{ tag: 'script', text: 'go()' }],
    nonce: 'r4nd0m',
    expected: '<script id="jx-head-0" nonce="r4nd0m">go()</script>',
  },
  {
    id: 'head-custom-style-gets-the-request-nonce',
    src: 'janux',
    tags: [{ tag: 'style', text: '.a{color:red}' }],
    nonce: 'r4nd0m',
    expected: '<style id="jx-head-0" nonce="r4nd0m">.a{color:red}</style>',
  },
  {
    /** A link needs no nonce: the policy governs its href, not an inline body. */
    id: 'head-custom-void-tags-get-no-nonce',
    src: 'janux',
    tags: [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/a.css' } }],
    nonce: 'r4nd0m',
    expected: '<link rel="stylesheet" href="/a.css" id="jx-head-0">',
  },
  {
    id: 'head-custom-non-raw-text-tags-get-no-nonce',
    src: 'janux',
    tags: [{ tag: 'noscript', text: 'no js' }],
    nonce: 'r4nd0m',
    expected: '<noscript id="jx-head-0">no js</noscript>',
  },
  {
    id: 'head-custom-nonce-is-escaped',
    src: 'janux',
    tags: [{ tag: 'script', text: 'go()' }],
    nonce: 'a"b',
    expected: '<script id="jx-head-0" nonce="a&quot;b">go()</script>',
  },
  {
    id: 'head-custom-empty-list-emits-nothing',
    src: 'janux',
    tags: [],
    expected: '',
  },
  {
    id: 'head-custom-mixed-list-keeps-document-order',
    src: 'janux',
    tags: [
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://a.test' } },
      { tag: 'style', text: '.a{}' },
      { tag: 'meta', attrs: { name: 'x', content: 'y' } },
    ],
    nonce: 'n',
    expected:
      '<link rel="preconnect" href="https://a.test" id="jx-head-0">' +
      '<style id="jx-head-1" nonce="n">.a{}</style>' +
      '<meta name="x" content="y" id="jx-head-2">',
  },
];
