import type { Case } from '../support/case';
import type { ContentFormat } from '../../janux-content/src/collection';

/**
 * Compiling a body to Janux JSX, on the server.
 *
 * `.md` and `.mdx` are two languages, and the extension is the only thing that
 * says which one a file is written in. In `.md`, `{count}` and `<Widget>` are
 * prose — corpora have been allowed to write them since long before MDX existed
 * — and raw HTML is passed through, because an author who typed `<figure>`
 * expects a figure and dropping it is how a migration loses content. In `.mdx`
 * the same characters are code: an expression evaluates, and a capitalised tag
 * must resolve to a component or the compile fails loudly.
 *
 * Nothing here reaches the browser. Prose ships 0 KB, which is why the compiler
 * lives behind a dynamic import and why these expectations are plain HTML with
 * no runtime markers in them at all.
 */
export interface RenderCase {
  body: string;
  format: ContentFormat;
  /** Which components the body may name. Only meaningful for `.mdx`, plus element overrides. */
  components?: 'widget' | 'h2';
  expected: string;
  /** The table of contents the same pass produced. */
  headings?: { depth: number; id: string; text: string }[];
}

export type RenderRow = Case<RenderCase>;

export const RENDER_CASES: RenderRow[] = [
  // Markdown: the parts every corpus relies on.
  {
    id: 'content-render-md-headings-and-emphasis',
    src: 'astro:content-collections#Renders-content',
    body: '# Hi\n\nSome *em* and **strong**.',
    format: 'md',
    expected: '<h1 id="hi">Hi</h1>\n<p>Some <em>em</em> and <strong>strong</strong>.</p>',
    headings: [{ depth: 1, id: 'hi', text: 'Hi' }],
  },
  {
    id: 'content-render-md-setext-headings',
    src: 'janux',
    body: 'Title\n=====\n\nSub\n---\n',
    format: 'md',
    expected: '<h1 id="title">Title</h1>\n<h2 id="sub">Sub</h2>',
    headings: [
      { depth: 1, id: 'title', text: 'Title' },
      { depth: 2, id: 'sub', text: 'Sub' },
    ],
  },
  {
    id: 'content-render-md-list',
    src: 'janux',
    body: '- one\n- two\n',
    format: 'md',
    expected: '<ul>\n<li>one</li>\n<li>two</li>\n</ul>',
  },
  {
    id: 'content-render-md-blockquote',
    src: 'janux',
    body: '> quoted\n',
    format: 'md',
    expected: '<blockquote>\n<p>quoted</p>\n</blockquote>',
  },
  {
    id: 'content-render-md-thematic-break',
    src: 'janux',
    body: 'a\n\n***\n\nb',
    format: 'md',
    expected: '<p>a</p>\n<hr/>\n<p>b</p>',
  },
  {
    id: 'content-render-md-hard-line-break',
    src: 'janux',
    body: 'a  \nb\n',
    format: 'md',
    expected: '<p>a<br/>\nb</p>',
  },
  {
    id: 'content-render-md-autolink',
    src: 'janux',
    body: '<https://example.test>',
    format: 'md',
    expected: '<p><a href="https://example.test">https://example.test</a></p>',
  },
  {
    id: 'content-render-md-empty-body',
    src: 'janux',
    body: '',
    format: 'md',
    expected: '',
  },
  {
    /** No GFM: a pipe table is prose, so enabling it later is a visible change, not a silent one. */
    id: 'content-render-md-pipe-table-is-not-parsed',
    src: 'janux',
    body: '| a | b |\n| - | - |\n| 1 | 2 |',
    format: 'md',
    expected: '<p>| a | b |\n| - | - |\n| 1 | 2 |</p>',
  },
  {
    /** Entities are decoded by the parser, and a bare `&` is escaped on the way out. */
    id: 'content-render-md-entities-are-decoded',
    src: 'janux',
    body: 'AT&amp;T and &copy;\n',
    format: 'md',
    expected: '<p>AT&amp;T and ©</p>',
  },
  {
    id: 'content-render-md-bare-ampersand-is-escaped',
    src: 'janux',
    body: 'Fish & chips\n',
    format: 'md',
    expected: '<p>Fish &amp; chips</p>',
  },
  {
    /** Code is text: the angle brackets and ampersands inside a fence must not become markup. */
    id: 'content-render-md-code-fence-escapes-its-content',
    src: 'janux',
    body: '```js\nconst a = 1 < 2 && 3 > 2;\n```',
    format: 'md',
    expected: '<pre><code class="language-js">const a = 1 &lt; 2 &amp;&amp; 3 &gt; 2;\n</code></pre>',
  },
  {
    id: 'content-render-md-inline-code-escapes-its-content',
    src: 'janux',
    body: 'Call `a<b>` now.',
    format: 'md',
    expected: '<p>Call <code>a&lt;b&gt;</code> now.</p>',
  },
  {
    /** An author who wrote `<figure>` gets a figure — dropping it is how a migration loses content. */
    id: 'content-render-md-raw-html-passes-through',
    src: 'janux',
    body: '<figure><img src="a.png"><figcaption>Cap</figcaption></figure>\n',
    format: 'md',
    expected: '<figure><img src="a.png"/><figcaption>Cap</figcaption></figure>',
  },
  {
    /**
     * A `.md` body is content, not code: braces are literal and a capitalised
     * tag is just an unknown element, never a component lookup.
     */
    id: 'content-render-md-braces-and-tags-are-prose',
    src: 'janux',
    body: 'Use {count} and <Widget> in prose.',
    format: 'md',
    expected: '<p>Use {count} and <widget> in prose.</widget></p>',
  },
  {
    /** Even with a component in scope, `.md` never mounts one — the extension decides. */
    id: 'content-render-md-ignores-components-in-scope',
    src: 'janux',
    body: '<Widget name="x" />\n',
    format: 'md',
    components: 'widget',
    expected: '<widget name="x"></widget>',
  },
  {
    /** Raw HTML is trusted, like every other module in the app. Content is not a sandbox. */
    id: 'content-render-md-script-passes-through-untouched',
    src: 'janux',
    body: '<script>alert(1)</script>\n',
    format: 'md',
    expected: '<script>alert(1)</script>',
  },
  {
    id: 'content-render-md-html-comment-is-dropped',
    src: 'janux',
    body: 'before\n\n<!-- secret -->\n\nafter',
    format: 'md',
    expected: '<p>before</p>\n\n<p>after</p>',
  },
  {
    /** Lowercase keys override elements, which is how an app applies its chrome without editing bodies. */
    id: 'content-render-md-element-override',
    src: 'janux',
    body: '## Over\n',
    format: 'md',
    components: 'h2',
    expected: '<h2 id="over" class="custom">Over</h2>',
    headings: [{ depth: 2, id: 'over', text: 'Over' }],
  },
  {
    /** The id lands on the rendered heading, and the TOC entry is the same string. */
    id: 'content-render-md-heading-id-matches-the-toc',
    src: 'janux',
    body: '## What is `foo`?\n',
    format: 'md',
    expected: '<h2 id="what-is-foo">What is <code>foo</code>?</h2>',
    headings: [{ depth: 2, id: 'what-is-foo', text: 'What is foo?' }],
  },
  {
    id: 'content-render-md-repeated-heading-text-repeats-the-anchor',
    src: 'janux',
    body: '# A\n\n## A\n',
    format: 'md',
    expected: '<h1 id="a">A</h1>\n<h2 id="a">A</h2>',
    headings: [
      { depth: 1, id: 'a', text: 'A' },
      { depth: 2, id: 'a', text: 'A' },
    ],
  },

  // MDX: the same characters, read as code.
  {
    id: 'content-render-mdx-expression-is-evaluated',
    src: 'janux',
    body: 'export const n = 2;\n\nValue {n + 1}\n',
    format: 'mdx',
    expected: '<p>Value 3</p>',
  },
  {
    id: 'content-render-mdx-mounts-a-component-in-scope',
    src: 'janux',
    body: '<Widget name="hi" />\n',
    format: 'mdx',
    components: 'widget',
    expected: '<span class="w">hi</span>',
  },
  {
    /** JSX, not raw HTML: `className` is a JSX prop and comes out as `class`. */
    id: 'content-render-mdx-jsx-is-not-reparsed-as-html',
    src: 'janux',
    body: '<div className="x">hi</div>\n',
    format: 'mdx',
    expected: '<div class="x">hi</div>',
  },
  {
    id: 'content-render-mdx-markdown-still-works-alongside-jsx',
    src: 'janux',
    body: '# T\n\n<Widget name="n" />\n',
    format: 'mdx',
    components: 'widget',
    expected: '<h1 id="t">T</h1>\n<span class="w">n</span>',
    headings: [{ depth: 1, id: 't', text: 'T' }],
  },
  {
    id: 'content-render-mdx-headings-are-collected-too',
    src: 'janux',
    body: '# MDX Head\n',
    format: 'mdx',
    expected: '<h1 id="mdx-head">MDX Head</h1>',
    headings: [{ depth: 1, id: 'mdx-head', text: 'MDX Head' }],
  },
  {
    id: 'content-render-mdx-element-override',
    src: 'janux',
    body: '## Over2\n',
    format: 'mdx',
    components: 'h2',
    expected: '<h2 id="over2" class="custom">Over2</h2>',
    headings: [{ depth: 2, id: 'over2', text: 'Over2' }],
  },
];

/** Bodies that must not compile, and the message an author gets. */
export interface RenderErrorCase {
  body: string;
  format: ContentFormat;
  components?: 'widget';
  /** A fragment of the thrown message. */
  expected: string;
}

export type RenderErrorRow = Case<RenderErrorCase>;

export const RENDER_ERROR_CASES: RenderErrorRow[] = [
  {
    /** `components` scopes what a body may name; anything else is a compile-time miss, not a blank. */
    id: 'content-render-mdx-unknown-component-is-named',
    src: 'janux',
    body: '<Widget name="x" />\n',
    format: 'mdx',
    expected: 'Expected component `Widget` to be defined',
  },
  {
    /** The file is in the message: a syntax error in one of eighty-five posts has to say which. */
    id: 'content-render-mdx-syntax-error-names-the-file',
    src: 'janux',
    body: '<Unclosed>\n',
    format: 'mdx',
    expected: 'failed to compile',
  },
  {
    id: 'content-render-mdx-broken-expression-fails-to-compile',
    src: 'janux',
    body: 'Value {1 +}\n',
    format: 'mdx',
    expected: 'failed to compile',
  },
];
