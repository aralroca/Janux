import type { Case } from '../support/case';

/**
 * A collection is a directory, read at call time — no loader, no virtual
 * module, no codegen.
 *
 * That is a deployment decision, not a taste one: Janux runs its production
 * server and its `output: "static"` prerender under Bun with no bundler in the
 * loop, so anything that only exists inside Vite would work in `dev` and vanish
 * in `build`. Reading the directory is what works everywhere the app runs.
 *
 * Ids are URL-shaped — the path inside the collection, extension dropped,
 * POSIX separators — because they come *from* URLs on the way back in. So they
 * are matched against the directory listing, never joined onto a path: an id is
 * user input, and `getEntry(posts, '../../etc/passwd')` has to be a miss rather
 * than a read.
 */
export interface CollectionCase {
  /** Files written into the collection directory before the call, by relative path. */
  files: Record<string, string>;
  /** An id to look up. Absent lists the whole collection instead. */
  lookup?: string;
  /** Listing: the ids in order. Lookup: the entry's title, or `null` for a miss. */
  expected: string[] | string | null;
}

export type CollectionRow = Case<CollectionCase>;

const post = (title: string) => `---\ntitle: ${title}\n---\nBody of ${title}\n`;

export const COLLECTION_CASES: CollectionRow[] = [
  {
    id: 'content-collection-lists-every-markdown-file',
    src: 'janux',
    files: { 'a.md': post('A'), 'b.mdx': post('B') },
    expected: ['a', 'b'],
  },
  {
    /** Ordered so a build is reproducible, and by `localeCompare` — so case does not split the list. */
    id: 'content-collection-orders-ids-case-insensitively',
    src: 'janux',
    files: { 'Zebra.md': post('Z'), 'apple.md': post('A'), 'Mango.md': post('M') },
    expected: ['apple', 'Mango', 'Zebra'],
  },
  {
    /** A nested file gets a nested id, with POSIX separators whatever the platform uses. */
    id: 'content-collection-nested-files-get-slashed-ids',
    src: 'janux',
    files: { 'guide/deep/one.md': post('One'), 'top.md': post('Top') },
    expected: ['guide/deep/one', 'top'],
  },
  {
    id: 'content-collection-ignores-other-extensions',
    src: 'janux',
    files: { 'a.md': post('A'), 'notes.txt': 'nope', 'b.markdown': post('B'), 'c.json': '{}' },
    expected: ['a'],
  },
  {
    /** A dotfile is a file: nothing here treats it as hidden. */
    id: 'content-collection-includes-dot-prefixed-files',
    src: 'janux',
    files: { '.draft.md': post('D'), 'a.md': post('A') },
    expected: ['.draft', 'a'],
  },
  {
    id: 'content-collection-keeps-spaces-in-ids',
    src: 'janux',
    files: { 'my post.md': post('Spaced') },
    expected: ['my post'],
  },
  {
    id: 'content-collection-empty-directory-is-not-an-error',
    src: 'astro:content-collections#Handles-the-empty-directory-correctly',
    files: {},
    expected: [],
  },

  // Lookups.
  {
    id: 'content-collection-finds-an-entry-by-id',
    src: 'janux',
    files: { 'a.md': post('A'), 'b.md': post('B') },
    lookup: 'b',
    expected: 'B',
  },
  {
    id: 'content-collection-finds-a-nested-entry',
    src: 'janux',
    files: { 'guide/deep.md': post('Deep') },
    lookup: 'guide/deep',
    expected: 'Deep',
  },
  {
    id: 'content-collection-finds-an-entry-whose-id-has-a-space',
    src: 'janux',
    files: { 'my post.md': post('Spaced') },
    lookup: 'my post',
    expected: 'Spaced',
  },
  {
    id: 'content-collection-unknown-id-is-a-miss',
    src: 'janux',
    files: { 'a.md': post('A') },
    lookup: 'ghost',
    expected: null,
  },
  {
    /** The id is matched, not joined — so a traversal is simply an id nothing answers to. */
    id: 'content-collection-traversal-id-is-a-miss',
    src: 'janux',
    files: { 'a.md': post('A') },
    lookup: '../a',
    expected: null,
  },
  {
    id: 'content-collection-absolute-id-is-a-miss',
    src: 'janux',
    files: { 'a.md': post('A') },
    lookup: '/a',
    expected: null,
  },
  {
    /** The extension is not part of the id, so asking with one is a miss. */
    id: 'content-collection-id-with-an-extension-is-a-miss',
    src: 'janux',
    files: { 'a.md': post('A') },
    lookup: 'a.md',
    expected: null,
  },
  {
    id: 'content-collection-empty-id-is-a-miss',
    src: 'janux',
    files: { 'a.md': post('A') },
    lookup: '',
    expected: null,
  },
  {
    id: 'content-collection-lookup-in-an-empty-directory',
    src: 'janux',
    files: {},
    lookup: 'a',
    expected: null,
  },
];

/** Directories that must fail loudly rather than pick a winner. */
export interface CollectionErrorCase {
  files: Record<string, string>;
  /** A fragment of the thrown message. */
  expected: string;
}

export type CollectionErrorRow = Case<CollectionErrorCase>;

export const COLLECTION_ERROR_CASES: CollectionErrorRow[] = [
  {
    /** `a.md` and `a.mdx` answer to one URL, and picking a winner silently is a coin toss. */
    id: 'content-collection-refuses-two-files-with-one-id',
    src: 'janux',
    files: { 'a.md': post('One'), 'a.mdx': post('Two') },
    expected: 'duplicate entry id "a"',
  },
  {
    id: 'content-collection-refuses-a-nested-duplicate-id',
    src: 'janux',
    files: { 'guide/a.md': post('One'), 'guide/a.mdx': post('Two') },
    expected: 'duplicate entry id "guide/a"',
  },
  {
    /** A page whose metadata is wrong should stop the build, not ship a title reading `undefined`. */
    id: 'content-collection-invalid-frontmatter-names-the-file',
    src: 'janux',
    files: { 'broken.md': '---\nsubtitle: no title here\n---\n' },
    expected: 'broken.md',
  },
  {
    id: 'content-collection-invalid-frontmatter-names-the-field',
    src: 'janux',
    files: { 'broken.md': '---\ntitle: 42\n---\n' },
    expected: 'title: expected string',
  },
  {
    id: 'content-collection-unterminated-block-fails-the-read',
    src: 'janux',
    files: { 'broken.md': '---\ntitle: A\nno closer\n' },
    expected: 'unterminated frontmatter block',
  },
];
