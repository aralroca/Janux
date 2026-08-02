import type { Case } from '../support/case';

/**
 * What a frontmatter value *is*, once parsed.
 *
 * The block is read with YAML's **core** schema, and that choice is the whole
 * point of this table. Under the older 1.1 rules `yes`, `on` and `n` are
 * booleans and `2026-07-01` is a `Date` — a type the schema layer has no kind
 * for, and one that turns `entry.data.date` into something a template cannot
 * print without knowing which parser ran. Core keeps `true`/`false` as the only
 * booleans and every date as the ISO string the author typed.
 *
 * The refusals matter as much: frontmatter must be a *map*. A block that parses
 * to a list, a scalar or nothing at all has no fields to validate, and letting
 * it through means a schema error pointing at the wrong thing entirely.
 */
export interface YamlCase {
  /** The YAML between the `---` fences. */
  yaml: string;
  expected: Record<string, unknown>;
}

export type YamlRow = Case<YamlCase>;

const block = (yaml: string) => `---\n${yaml}\n---\nBody\n`;

export const YAML_CASES: YamlRow[] = [
  { id: 'content-yaml-string-scalar', src: 'janux', yaml: 'title: Hello', expected: { title: 'Hello' } },
  { id: 'content-yaml-true-and-false-are-booleans', src: 'janux', yaml: 'a: true\nb: false', expected: { a: true, b: false } },
  {
    /** YAML 1.1 read these as booleans; the core schema does not, and an app must not have to guess. */
    id: 'content-yaml-yes-and-off-are-strings',
    src: 'janux',
    yaml: 'a: yes\nb: off\nc: on\nd: n',
    expected: { a: 'yes', b: 'off', c: 'on', d: 'n' },
  },
  { id: 'content-yaml-integer', src: 'janux', yaml: 'n: 42', expected: { n: 42 } },
  { id: 'content-yaml-negative-float', src: 'janux', yaml: 'n: -0.5', expected: { n: -0.5 } },
  { id: 'content-yaml-exponent-notation', src: 'janux', yaml: 'n: 1e3', expected: { n: 1000 } },
  { id: 'content-yaml-hexadecimal', src: 'janux', yaml: 'n: 0x1A', expected: { n: 26 } },
  { id: 'content-yaml-octal', src: 'janux', yaml: 'n: 0o17', expected: { n: 15 } },
  {
    /**
     * Core does carry `.inf` and `.nan`, so frontmatter can hold a number JSON
     * cannot round-trip — `JSON.stringify` turns all three into `null`. Anything
     * that serialises `entry.data` has to know that; the parser will not soften it.
     */
    id: 'content-yaml-infinity-and-nan-are-real-numbers',
    src: 'janux',
    yaml: 'a: .inf\nb: -.inf\nc: .nan',
    expected: { a: Number.POSITIVE_INFINITY, b: Number.NEGATIVE_INFINITY, c: Number.NaN },
  },
  { id: 'content-yaml-explicit-null-forms', src: 'janux', yaml: 'a: null\nb: ~\nc:', expected: { a: null, b: null, c: null } },
  {
    /** Quoting is how an author says "this is text", and it has to survive. */
    id: 'content-yaml-quoted-number-stays-a-string',
    src: 'janux',
    yaml: 'a: "42"\nb: \'true\'',
    expected: { a: '42', b: 'true' },
  },
  { id: 'content-yaml-version-like-string', src: 'janux', yaml: 'v: 1.2.3', expected: { v: '1.2.3' } },
  {
    /** The row the core schema exists for: a date stays the string the author wrote. */
    id: 'content-yaml-iso-date-stays-a-string',
    src: 'astro:content-frontmatter#date',
    yaml: 'date: 2026-07-01',
    expected: { date: '2026-07-01' },
  },
  { id: 'content-yaml-timestamp-stays-a-string', src: 'janux', yaml: 'at: 2026-07-01T10:30:00Z', expected: { at: '2026-07-01T10:30:00Z' } },
  { id: 'content-yaml-inline-sequence', src: 'janux', yaml: 'tags: [a, b]', expected: { tags: ['a', 'b'] } },
  { id: 'content-yaml-block-sequence', src: 'janux', yaml: 'tags:\n  - a\n  - b', expected: { tags: ['a', 'b'] } },
  { id: 'content-yaml-empty-inline-collections', src: 'janux', yaml: 'a: []\nb: {}', expected: { a: [], b: {} } },
  { id: 'content-yaml-nested-map', src: 'janux', yaml: 'meta:\n  tag: t\n  deep:\n    n: 1', expected: { meta: { tag: 't', deep: { n: 1 } } } },
  { id: 'content-yaml-sequence-of-maps', src: 'janux', yaml: 'authors:\n  - name: A\n  - name: B', expected: { authors: [{ name: 'A' }, { name: 'B' }] } },
  { id: 'content-yaml-quoted-value-with-a-colon', src: 'janux', yaml: 'title: "Janux: a framework"', expected: { title: 'Janux: a framework' } },
  {
    id: 'content-yaml-literal-block-scalar-keeps-newlines',
    src: 'janux',
    yaml: 'text: |\n  line1\n  line2',
    expected: { text: 'line1\nline2\n' },
  },
  {
    id: 'content-yaml-folded-block-scalar-joins-lines',
    src: 'janux',
    yaml: 'text: >\n  a\n  b',
    expected: { text: 'a b\n' },
  },
  { id: 'content-yaml-anchor-and-alias-are-resolved', src: 'janux', yaml: 'base: &b hello\ncopy: *b', expected: { base: 'hello', copy: 'hello' } },
  {
    /** Merge keys are a 1.1 extension: core keeps `<<` as an ordinary key rather than merging. */
    id: 'content-yaml-merge-key-is-not-merged',
    src: 'janux',
    yaml: 'a:\n  <<: {y: 2}\n  z: 3',
    expected: { a: { '<<': { y: 2 }, z: 3 } },
  },
  { id: 'content-yaml-non-ascii-key-and-value', src: 'janux', yaml: 'título: Olá 日本', expected: { título: 'Olá 日本' } },
  { id: 'content-yaml-key-containing-spaces', src: 'janux', yaml: 'my key: v', expected: { 'my key': 'v' } },
  { id: 'content-yaml-comment-is-ignored', src: 'janux', yaml: 'a: 1 # trailing\n# whole line\nb: 2', expected: { a: 1, b: 2 } },
  { id: 'content-yaml-value-is-trimmed', src: 'janux', yaml: 'a: spaced   ', expected: { a: 'spaced' } },
  { id: 'content-yaml-escape-sequences-in-double-quotes', src: 'janux', yaml: 'a: "line\\nbreak"', expected: { a: 'line\nbreak' } },
  { id: 'content-yaml-single-quotes-keep-backslashes', src: 'janux', yaml: "a: 'C:\\path'", expected: { a: 'C:\\path' } },
  {
    /** An empty block is an empty map, not an error: a file may legitimately have no metadata. */
    id: 'content-yaml-empty-block-is-an-empty-map',
    src: 'janux',
    yaml: '',
    expected: {},
  },
  {
    id: 'content-yaml-whitespace-only-block-is-an-empty-map',
    src: 'janux',
    yaml: '   ',
    expected: {},
  },
];

export const YAML_SOURCES = block;

/** Blocks that cannot become a field map, and the message that says why. */
export interface YamlErrorCase {
  yaml: string;
  /** A fragment of the thrown message. */
  expected: string;
}

export type YamlErrorRow = Case<YamlErrorCase>;

export const YAML_ERROR_CASES: YamlErrorRow[] = [
  { id: 'content-yaml-refuses-a-sequence-document', src: 'janux', yaml: '- a\n- b', expected: 'frontmatter must be a map of fields' },
  { id: 'content-yaml-refuses-a-scalar-document', src: 'janux', yaml: 'just a string', expected: 'frontmatter must be a map of fields' },
  { id: 'content-yaml-refuses-a-null-document', src: 'janux', yaml: 'null', expected: 'frontmatter must be a map of fields' },
  {
    /** A block of nothing but comments parses to null, which is not a map either. */
    id: 'content-yaml-refuses-a-comment-only-block',
    src: 'janux',
    yaml: '# nothing here',
    expected: 'frontmatter must be a map of fields',
  },
  {
    /** The classic: an unquoted colon. The parser names the column, and Janux names the file. */
    id: 'content-yaml-refuses-an-unquoted-colon',
    src: 'janux',
    yaml: 'title: Janux: a framework',
    expected: 'unparseable frontmatter',
  },
  { id: 'content-yaml-refuses-a-duplicate-key', src: 'janux', yaml: 'a: 1\na: 2', expected: 'unparseable frontmatter' },
  { id: 'content-yaml-refuses-tab-indentation', src: 'janux', yaml: 'a:\n\tb: 1', expected: 'unparseable frontmatter' },
  { id: 'content-yaml-refuses-an-unclosed-inline-collection', src: 'janux', yaml: 'a: [1, 2', expected: 'unparseable frontmatter' },
];
