import type { Case } from '../support/case';
import type { Heading } from '../../janux-content/src/headings';

/**
 * The table of contents, built while the tree is already in hand.
 *
 * It is a rehype plugin rather than a second parse of the Markdown, and that is
 * the guarantee: the id stamped into the HTML and the id the TOC links to are
 * the same string by construction, so an anchor cannot point at a heading that
 * rendered differently. A second parse would agree right up until the first
 * plugin that rewrites a heading.
 *
 * A heading's text is its *rendered* text — element children flattened, code
 * spans and raw HTML included — because that is what a reader sees and what the
 * id must therefore be derived from.
 */
export interface HeadingNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HeadingNode[];
}

export interface HeadingCase {
  /** A hast tree, as rehype hands it to the plugin. */
  tree: HeadingNode;
  expected: Heading[];
  /** The ids stamped onto the tree, in visit order — `null` for a node left alone. */
  stamped: (string | null)[];
}

export type HeadingRow = Case<HeadingCase>;

const text = (value: string): HeadingNode => ({ type: 'text', value });
const el = (tagName: string, children: HeadingNode[], properties?: Record<string, unknown>): HeadingNode => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const root = (...children: HeadingNode[]): HeadingNode => ({ type: 'root', children });

export const HEADING_CASES: HeadingRow[] = [
  {
    id: 'content-heading-collects-a-single-heading',
    src: 'janux',
    tree: root(el('h1', [text('Title')])),
    expected: [{ depth: 1, id: 'title', text: 'Title' }],
    stamped: ['title'],
  },
  {
    id: 'content-heading-records-every-depth',
    src: 'janux',
    tree: root(el('h1', [text('One')]), el('h3', [text('Three')]), el('h6', [text('Six')])),
    expected: [
      { depth: 1, id: 'one', text: 'One' },
      { depth: 3, id: 'three', text: 'Three' },
      { depth: 6, id: 'six', text: 'Six' },
    ],
    stamped: ['one', 'three', 'six'],
  },
  {
    /** Document order, not depth order: a TOC renders in the order a reader meets the headings. */
    id: 'content-heading-keeps-document-order',
    src: 'janux',
    tree: root(el('h2', [text('B')]), el('h1', [text('A')])),
    expected: [
      { depth: 2, id: 'b', text: 'B' },
      { depth: 1, id: 'a', text: 'A' },
    ],
    stamped: ['b', 'a'],
  },
  {
    id: 'content-heading-ignores-non-heading-elements',
    src: 'janux',
    tree: root(el('p', [text('prose')]), el('div', [text('box')]), el('h2', [text('Real')])),
    expected: [{ depth: 2, id: 'real', text: 'Real' }],
    stamped: [null, null, 'real'],
  },
  {
    /** `h7` is not a heading, and a tag that merely starts with `h` is not one either. */
    id: 'content-heading-ignores-lookalike-tags',
    src: 'janux',
    tree: root(el('h7', [text('Seven')]), el('hr', []), el('header', [text('Head')])),
    expected: [],
    stamped: [null, null, null],
  },
  {
    /** The walk is deep, so a heading inside any wrapper is still collected. */
    id: 'content-heading-finds-a-nested-heading',
    src: 'janux',
    tree: root(el('blockquote', [el('section', [el('h2', [text('Deep')])])])),
    expected: [{ depth: 2, id: 'deep', text: 'Deep' }],
    stamped: [null],
  },
  {
    /** A code span reads as its text: the id follows what the heading looks like. */
    id: 'content-heading-flattens-element-children',
    src: 'janux',
    tree: root(el('h2', [text('Use '), el('code', [text('render()')]), text(' first')])),
    expected: [{ depth: 2, id: 'use-render-first', text: 'Use render() first' }],
    stamped: ['use-render-first'],
  },
  {
    /** Raw HTML counts as text too — it is what the reader will see once it is parsed. */
    id: 'content-heading-includes-raw-html-text',
    src: 'janux',
    tree: root(el('h3', [{ type: 'raw', value: '<b>Bold</b>' }])),
    expected: [{ depth: 3, id: 'bboldb', text: '<b>Bold</b>' }],
    stamped: ['bboldb'],
  },
  {
    id: 'content-heading-trims-surrounding-whitespace',
    src: 'janux',
    tree: root(el('h2', [text('  Spaced  ')])),
    expected: [{ depth: 2, id: 'spaced', text: 'Spaced' }],
    stamped: ['spaced'],
  },
  {
    /** An id already on the node wins: a plugin or an author asked for that anchor. */
    id: 'content-heading-honours-an-existing-id',
    src: 'janux',
    tree: root(el('h2', [text('Custom')], { id: 'keep-me' })),
    expected: [{ depth: 2, id: 'keep-me', text: 'Custom' }],
    stamped: ['keep-me'],
  },
  {
    /** Other properties survive: the plugin adds an id, it does not rewrite the node. */
    id: 'content-heading-leaves-other-properties-alone',
    src: 'janux',
    tree: root(el('h2', [text('Classy')], { className: ['big'] })),
    expected: [{ depth: 2, id: 'classy', text: 'Classy' }],
    stamped: ['classy'],
  },
  {
    /**
     * Two headings with the same text get the same id — no `-1` suffix. The
     * first one wins the anchor, and a document that repeats a heading has an
     * ambiguous TOC entry rather than a silently renamed one.
     */
    id: 'content-heading-duplicate-text-duplicates-the-id',
    src: 'janux',
    tree: root(el('h1', [text('Setup')]), el('h2', [text('Setup')])),
    expected: [
      { depth: 1, id: 'setup', text: 'Setup' },
      { depth: 2, id: 'setup', text: 'Setup' },
    ],
    stamped: ['setup', 'setup'],
  },
  {
    /** A heading that slugs to nothing still gets an entry, with an empty anchor. */
    id: 'content-heading-unslugabble-text-yields-an-empty-id',
    src: 'janux',
    tree: root(el('h2', [text('日本語')])),
    expected: [{ depth: 2, id: '', text: '日本語' }],
    stamped: [''],
  },
  {
    id: 'content-heading-empty-heading',
    src: 'janux',
    tree: root(el('h2', [])),
    expected: [{ depth: 2, id: '', text: '' }],
    stamped: [''],
  },
  {
    id: 'content-heading-no-headings-at-all',
    src: 'janux',
    tree: root(el('p', [text('nothing here')])),
    expected: [],
    stamped: [null],
  },
];
