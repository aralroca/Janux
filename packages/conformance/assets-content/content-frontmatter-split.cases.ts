import type { Case } from '../support/case';

/**
 * Where the frontmatter block ends and the content begins.
 *
 * The split is textual and deliberately strict: only a `---` in column 0 of
 * line 1 opens a block, and only a `---` alone on its own line closes one.
 * Everything looser turns a document that happens to contain a horizontal rule
 * into one whose prose was silently eaten as metadata.
 *
 * The unterminated case throws rather than falling back to "it was all body",
 * because that fallback hides the typo behind a page that renders its own
 * frontmatter as text — the author sees a mess and no reason for it.
 */
export interface SplitCase {
  source: string;
  /** The block's YAML, or `undefined` when the file opens with content. */
  yaml: string | undefined;
  body: string;
}

export type SplitRow = Case<SplitCase>;

export const SPLIT_CASES: SplitRow[] = [
  {
    id: 'content-split-plain-block-and-body',
    src: 'astro:content-frontmatter#basic',
    source: '---\ntitle: A\n---\nBody text\n',
    yaml: 'title: A',
    body: 'Body text\n',
  },
  {
    id: 'content-split-multiline-block',
    src: 'janux',
    source: '---\ntitle: A\ndate: 2026-07-01\n---\nBody\n',
    yaml: 'title: A\ndate: 2026-07-01',
    body: 'Body\n',
  },
  {
    id: 'content-split-no-frontmatter-is-all-body',
    src: 'janux',
    source: '# Heading\n\nProse.\n',
    yaml: undefined,
    body: '# Heading\n\nProse.\n',
  },
  {
    id: 'content-split-empty-file',
    src: 'janux',
    source: '',
    yaml: undefined,
    body: '',
  },
  {
    /** Only line 1 opens a block, so a rule further down is content. */
    id: 'content-split-later-dashes-are-content',
    src: 'janux',
    source: 'Intro\n\n---\n\nMore\n',
    yaml: undefined,
    body: 'Intro\n\n---\n\nMore\n',
  },
  {
    /** Column 0 too: one leading space and it is prose. */
    id: 'content-split-indented-opener-is-content',
    src: 'janux',
    source: ' ---\ntitle: A\n---\n',
    yaml: undefined,
    body: ' ---\ntitle: A\n---\n',
  },
  {
    id: 'content-split-four-dashes-do-not-open',
    src: 'janux',
    source: '----\ntitle: A\n---\n',
    yaml: undefined,
    body: '----\ntitle: A\n---\n',
  },
  {
    /** A byte-order mark is invisible in an editor and moves `---` off column 0. */
    id: 'content-split-bom-prevents-the-open',
    src: 'janux',
    source: '﻿---\ntitle: A\n---\nB',
    yaml: undefined,
    body: '﻿---\ntitle: A\n---\nB',
  },
  {
    id: 'content-split-trailing-spaces-on-the-opener',
    src: 'janux',
    source: '---  \ntitle: A\n---\nB',
    yaml: 'title: A',
    body: 'B',
  },
  {
    id: 'content-split-trailing-tab-on-the-closer',
    src: 'janux',
    source: '---\ntitle: A\n---\t\nB',
    yaml: 'title: A',
    body: 'B',
  },
  {
    /** A closer may be the last line of the file, with no newline after it. */
    id: 'content-split-closer-at-end-of-file',
    src: 'janux',
    source: '---\ntitle: A\n---',
    yaml: 'title: A',
    body: '',
  },
  {
    id: 'content-split-block-with-no-body',
    src: 'janux',
    source: '---\ntitle: A\n---\n',
    yaml: 'title: A',
    body: '',
  },
  {
    id: 'content-split-empty-block',
    src: 'janux',
    source: '---\n---\nBody\n',
    yaml: '',
    body: 'Body\n',
  },
  {
    /** An indented `---` does not close, so it stays inside the YAML. */
    id: 'content-split-indented-closer-does-not-close',
    src: 'janux',
    source: '---\ntitle: A\n ---\n---\nB',
    yaml: 'title: A\n ---',
    body: 'B',
  },
  {
    id: 'content-split-dashes-with-a-suffix-do-not-close',
    src: 'janux',
    source: '---\ntitle: A\n---x\n---\nB',
    yaml: 'title: A\n---x',
    body: 'B',
  },
  {
    /** The first real closer wins; anything after it is body, verbatim. */
    id: 'content-split-second-block-is-body',
    src: 'janux',
    source: '---\ntitle: A\n---\n---\ntitle: B\n---\n',
    yaml: 'title: A',
    body: '---\ntitle: B\n---\n',
  },
  {
    /** Blank lines between the block and the body are separator, not content. */
    id: 'content-split-blank-lines-after-the-block-are-dropped',
    src: 'janux',
    source: '---\ntitle: A\n---\n\n\n\nBody\n',
    yaml: 'title: A',
    body: 'Body\n',
  },
  {
    id: 'content-split-whitespace-only-lines-after-the-block-are-dropped',
    src: 'janux',
    source: '---\ntitle: A\n---\n  \n\t\nBody\n',
    yaml: 'title: A',
    body: 'Body\n',
  },
  {
    /** Indentation on a *non-blank* first line is content — a code block starts that way. */
    id: 'content-split-indented-first-body-line-is-kept',
    src: 'janux',
    source: '---\ntitle: A\n---\n    indented code\n',
    yaml: 'title: A',
    body: '    indented code\n',
  },
  {
    id: 'content-split-crlf-throughout',
    src: 'janux',
    source: '---\r\ntitle: A\r\n---\r\nBody\r\n',
    yaml: 'title: A',
    body: 'Body\r\n',
  },
  {
    /** The body keeps its own line endings: only the block's trailing newline is trimmed. */
    id: 'content-split-crlf-body-is-preserved-verbatim',
    src: 'janux',
    source: '---\r\ntitle: A\r\n---\r\nLine1\r\nLine2\r\n',
    yaml: 'title: A',
    body: 'Line1\r\nLine2\r\n',
  },
  {
    id: 'content-split-body-without-a-trailing-newline',
    src: 'janux',
    source: '---\ntitle: A\n---\nno newline at eof',
    yaml: 'title: A',
    body: 'no newline at eof',
  },
  {
    /** A `---` inside a quoted YAML value still closes the block: the split is textual. */
    id: 'content-split-dashes-inside-a-value-close-the-block',
    src: 'janux',
    source: '---\ntitle: "a\n---\nb"\n---\nBody\n',
    yaml: 'title: "a',
    body: 'b"\n---\nBody\n',
  },
  {
    id: 'content-split-comment-only-block',
    src: 'janux',
    source: '---\n# just a comment\n---\nBody\n',
    yaml: '# just a comment',
    body: 'Body\n',
  },
];

/**
 * Sources whose block nobody closed. Reading them as body would hide the typo
 * behind a page that renders its own metadata.
 */
export interface SplitErrorCase {
  source: string;
  expected: string;
}

export type SplitErrorRow = Case<SplitErrorCase>;

const UNTERMINATED = 'Janux content: unterminated frontmatter block — the opening `---` has no closing `---`.';

export const SPLIT_ERROR_CASES: SplitErrorRow[] = [
  { id: 'content-split-unterminated-block', src: 'janux', source: '---\ntitle: A\nBody without a closer\n', expected: UNTERMINATED },
  { id: 'content-split-opener-then-eof', src: 'janux', source: '---\n', expected: UNTERMINATED },
  { id: 'content-split-only-an-indented-closer', src: 'janux', source: '---\ntitle: A\n  ---\n', expected: UNTERMINATED },
  { id: 'content-split-only-a-suffixed-closer', src: 'janux', source: '---\ntitle: A\n--- x\n', expected: UNTERMINATED },
];
