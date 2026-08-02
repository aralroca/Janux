import type { Case } from '../support/case';

/**
 * Heading ids, which are also the anchors a table of contents links to.
 *
 * The two are produced from one function in one pass, so an anchor cannot point
 * at a heading that rendered differently — but that also means the slug rules
 * are a public contract: they are in URLs people bookmark, and changing them
 * breaks every deep link ever shared.
 *
 * The rule is deliberately ASCII-only: lowercase, drop everything that is not a
 * letter, digit, space or dash, then collapse whitespace runs into single
 * dashes. That has consequences worth stating out loud rather than discovering
 * — an accent is dropped rather than transliterated (`café` → `caf`), a
 * non-Latin heading slugs to the empty string, and an underscore does not
 * survive at all.
 */
export interface SlugCase {
  text: string;
  expected: string;
}

export type SlugRow = Case<SlugCase>;

export const SLUG_CASES: SlugRow[] = [
  { id: 'content-slug-lowercases-and-joins-words', src: 'janux', text: 'Hello World', expected: 'hello-world' },
  { id: 'content-slug-already-lowercase-is-unchanged', src: 'janux', text: 'hello', expected: 'hello' },
  { id: 'content-slug-mixed-case-is-flattened', src: 'janux', text: 'MiXeD CaSe', expected: 'mixed-case' },
  { id: 'content-slug-digits-are-kept', src: 'janux', text: 'Chapter 2', expected: 'chapter-2' },
  { id: 'content-slug-leading-digits-are-kept', src: 'janux', text: '2026 in review', expected: '2026-in-review' },
  { id: 'content-slug-trailing-punctuation-is-dropped', src: 'janux', text: 'What?!', expected: 'what' },
  { id: 'content-slug-inner-punctuation-is-dropped', src: 'janux', text: "Don't panic", expected: 'dont-panic' },
  { id: 'content-slug-dots-are-dropped', src: 'janux', text: 'v1.2.3', expected: 'v123' },
  {
    /** Not a word separator: `snake_case` collapses into one word, which surprises people. */
    id: 'content-slug-underscores-are-dropped-not-converted',
    src: 'janux',
    text: 'snake_case_name',
    expected: 'snakecasename',
  },
  { id: 'content-slug-ampersand-is-dropped', src: 'janux', text: 'Rust & Go', expected: 'rust-go' },
  { id: 'content-slug-plus-signs-are-dropped', src: 'janux', text: 'C++ basics', expected: 'c-basics' },
  { id: 'content-slug-slashes-are-dropped', src: 'janux', text: 'input/output', expected: 'inputoutput' },
  { id: 'content-slug-parentheses-are-dropped', src: 'janux', text: 'Setup (optional)', expected: 'setup-optional' },
  { id: 'content-slug-colons-are-dropped', src: 'janux', text: 'Janux: a framework', expected: 'janux-a-framework' },
  { id: 'content-slug-leading-and-trailing-spaces-are-trimmed', src: 'janux', text: '  padded  ', expected: 'padded' },
  { id: 'content-slug-runs-of-spaces-collapse-to-one-dash', src: 'janux', text: 'a    b', expected: 'a-b' },
  { id: 'content-slug-tabs-and-newlines-are-whitespace-too', src: 'janux', text: 'tabs\tand\nnewlines', expected: 'tabs-and-newlines' },
  {
    /** Existing dashes are kept as-is, so a spaced dash becomes three of them. */
    id: 'content-slug-spaced-dash-becomes-three-dashes',
    src: 'janux',
    text: 'a - b',
    expected: 'a---b',
  },
  { id: 'content-slug-existing-dashes-survive-untouched', src: 'janux', text: '--flags--', expected: '--flags--' },
  { id: 'content-slug-hyphenated-word-is-unchanged', src: 'janux', text: 'server-side rendering', expected: 'server-side-rendering' },
  {
    /** Dropped, not transliterated: `café` and `cafe` are different anchors. */
    id: 'content-slug-accents-are-dropped',
    src: 'janux',
    text: 'Café au lait',
    expected: 'caf-au-lait',
  },
  { id: 'content-slug-uppercase-accents-are-dropped-after-lowercasing', src: 'janux', text: 'ÉCOLE', expected: 'cole' },
  { id: 'content-slug-cjk-slugs-to-nothing', src: 'janux', text: '日本語', expected: '' },
  { id: 'content-slug-cyrillic-slugs-to-nothing', src: 'janux', text: 'Привет', expected: '' },
  { id: 'content-slug-emoji-are-dropped', src: 'janux', text: 'ship it 🚀 now', expected: 'ship-it-now' },
  { id: 'content-slug-mixed-script-keeps-only-ascii', src: 'janux', text: 'Guide 案内', expected: 'guide' },
  { id: 'content-slug-punctuation-only-is-empty', src: 'janux', text: '!!!', expected: '' },
  { id: 'content-slug-empty-text-is-empty', src: 'janux', text: '', expected: '' },
  { id: 'content-slug-whitespace-only-is-empty', src: 'janux', text: '   ', expected: '' },
  {
    /** Backticks go, so a heading naming a symbol slugs to the symbol itself. */
    id: 'content-slug-code-ticks-are-dropped',
    src: 'janux',
    text: 'What is `foo`?',
    expected: 'what-is-foo',
  },
];
