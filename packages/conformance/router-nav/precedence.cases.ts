import type { Case } from '../support/case';

/**
 * Route precedence: which pattern wins when several could match.
 *
 * The route-sort spec (docs: guide/navigation.md) is deterministic — specificity
 * is compared segment-by-segment, most-specific first: static > typed > dynamic >
 * catch-all > optional-catch-all; an exact-depth route beats a rest segment that
 * would swallow it; ties break on pattern text. Every case here pins one
 * consequence of that spec against a fixture tree built to maximise overlap, so a
 * sorting regression cannot hide behind "some route still matched". Cases follow
 * `next:route-sorter`, `kit:routing#sorting` and `astro:priority`.
 *
 * The fixture tree in `__fixtures__/precedence`:
 *   index.tsx  about.tsx  [one].tsx  [num=integer].tsx  [...rest].tsx  [[...all]].tsx
 *   [two]/index.tsx
 *   docs/{index,intro,[page]}.tsx  docs/[page]/edit.tsx  docs/[...path].tsx
 *   mix/static/{index,leaf,[id]}.tsx  mix/[a]/{index,leaf,[b]}.tsx  mix/[...r].tsx
 *   typed/new.tsx  typed/[id=integer]/{index,edit}.tsx  typed/[slug]/{index,edit}.tsx
 *   depth/fixed/[b]/[c].tsx  depth/[a]/fixed/[c].tsx  depth/[a]/[b]/fixed.tsx
 *   depth/[a]/[b]/[c].tsx  depth/[...rest].tsx
 *   opt/{index,fixed,[x]}.tsx  opt/[[...rest]].tsx
 *   both/[...req].tsx  both/[[...opt]].tsx
 *   greedy/[g]/z.tsx  greedy/[...r].tsx
 */
export interface PrecedenceCase {
  path: string;
  /** The route pattern that must win, or `null` for no match. */
  pattern: string | null;
  /** Params the winner must yield; omitted means `{}`. */
  params?: Record<string, string>;
}

export type PrecedenceRow = Case<PrecedenceCase>;

export const PRECEDENCE_CASES: PrecedenceRow[] = [
  // ── every kind loses to a more specific sibling, left to right ──────────────
  { id: 'prec-index-beats-a-root-optional-catchall', src: 'next:route-sorter#root-optional', path: '/', pattern: '/', params: {} },
  { id: 'prec-static-beats-every-dynamic-kind-at-once', src: 'next:route-sorter#static-first', path: '/about', pattern: '/about', params: {} },
  { id: 'prec-typed-beats-plain-dynamic', src: 'kit:routing#matcher-priority', path: '/42', pattern: '/[num=integer]', params: { num: '42' } },
  { id: 'prec-required-catchall-beats-the-optional-sibling', src: 'janux', path: '/a/b', pattern: '/[...rest]', params: { rest: 'a/b' } },
  { id: 'prec-equal-specificity-ties-break-on-pattern-text', src: 'kit:routing#alphabetical-tie', path: '/word', pattern: '/[one]', params: { one: 'word' } },
  { id: 'prec-bracket-literal-goes-to-the-winning-dynamic', src: 'janux', path: '/[two]', pattern: '/[one]', params: { one: '[two]' } },

  // ── falling through: a rejected candidate hands over, never 404s ────────────
  { id: 'prec-case-mismatch-falls-through-to-the-dynamic-sibling', src: 'astro:routing#case-fallthrough', path: '/About', pattern: '/[one]', params: { one: 'About' } },
  { id: 'prec-matcher-rejection-falls-through-to-dynamic', src: 'kit:routing#matcher-fallthrough', path: '/9x', pattern: '/[one]', params: { one: '9x' } },
  { id: 'prec-negative-number-falls-through-to-dynamic', src: 'janux', path: '/-3', pattern: '/[one]', params: { one: '-3' } },

  // ── a directory with an index competes like any other route ─────────────────
  { id: 'prec-directory-index-beats-dynamic-and-rest', src: 'janux', path: '/docs', pattern: '/docs', params: {} },
  { id: 'prec-static-leaf-beats-dynamic-and-rest-siblings', src: 'next:route-sorter#leaf', path: '/docs/intro', pattern: '/docs/intro' },
  { id: 'prec-trailing-slash-does-not-change-the-winner', src: 'janux', path: '/docs/intro/', pattern: '/docs/intro' },
  { id: 'prec-dynamic-beats-rest-for-one-segment', src: 'next:route-sorter#dynamic-over-catchall', path: '/docs/guide', pattern: '/docs/[page]', params: { page: 'guide' } },
  { id: 'prec-dynamic-with-static-tail-beats-rest', src: 'janux', path: '/docs/guide/edit', pattern: '/docs/[page]/edit', params: { page: 'guide' } },
  { id: 'prec-static-name-reappears-under-the-dynamic-branch', src: 'janux', path: '/docs/intro/edit', pattern: '/docs/[page]/edit', params: { page: 'intro' } },
  { id: 'prec-rest-takes-what-no-exact-route-fits', src: 'janux', path: '/docs/guide/a/b', pattern: '/docs/[...path]', params: { path: 'guide/a/b' } },

  // ── comparison is left-to-right: an early static outranks a late one ────────
  { id: 'prec-earlier-static-segment-dominates', src: 'next:route-sorter#left-to-right', path: '/mix/static/xyz', pattern: '/mix/static/[id]', params: { id: 'xyz' } },
  { id: 'prec-later-static-cannot-rescue-an-earlier-dynamic', src: 'janux', path: '/mix/other/leaf', pattern: '/mix/[a]/leaf', params: { a: 'other' } },
  { id: 'prec-all-dynamic-wins-only-when-nothing-static-fits', src: 'janux', path: '/mix/other/thing', pattern: '/mix/[a]/[b]', params: { a: 'other', b: 'thing' } },
  { id: 'prec-static-index-beats-the-dynamic-index-sibling', src: 'janux', path: '/mix/static', pattern: '/mix/static' },
  { id: 'prec-dynamic-directory-index-catches-the-rest', src: 'janux', path: '/mix/other', pattern: '/mix/[a]', params: { a: 'other' } },
  { id: 'prec-depth-mismatch-falls-to-rest', src: 'janux', path: '/mix/a/b/c', pattern: '/mix/[...r]', params: { r: 'a/b/c' } },

  // ── typed matchers participate in precedence per segment ────────────────────
  { id: 'prec-static-beats-typed-sibling', src: 'kit:routing#static-over-matcher', path: '/typed/new', pattern: '/typed/new' },
  { id: 'prec-typed-beats-dynamic-directory', src: 'janux', path: '/typed/7', pattern: '/typed/[id=integer]', params: { id: '7' } },
  { id: 'prec-typed-branch-keeps-winning-below', src: 'janux', path: '/typed/7/edit', pattern: '/typed/[id=integer]/edit', params: { id: '7' } },
  { id: 'prec-matcher-rejection-selects-the-dynamic-directory', src: 'kit:routing#matcher-directory-fallthrough', path: '/typed/abc', pattern: '/typed/[slug]', params: { slug: 'abc' } },
  { id: 'prec-matcher-rejection-applies-per-segment-not-per-branch', src: 'janux', path: '/typed/abc/edit', pattern: '/typed/[slug]/edit', params: { slug: 'abc' } },
  { id: 'prec-static-sibling-does-not-shadow-its-own-subtree', src: 'janux', path: '/typed/new/edit', pattern: '/typed/[slug]/edit', params: { slug: 'new' } },

  // ── depth three: the static segment may sit at any position ─────────────────
  { id: 'prec-first-segment-static-wins-at-depth-three', src: 'next:route-sorter#depth', path: '/depth/fixed/x/y', pattern: '/depth/fixed/[b]/[c]', params: { b: 'x', c: 'y' } },
  { id: 'prec-second-segment-static-wins-when-the-first-ties', src: 'janux', path: '/depth/x/fixed/y', pattern: '/depth/[a]/fixed/[c]', params: { a: 'x', c: 'y' } },
  { id: 'prec-third-segment-static-wins-when-earlier-ones-tie', src: 'janux', path: '/depth/x/y/fixed', pattern: '/depth/[a]/[b]/fixed', params: { a: 'x', b: 'y' } },
  { id: 'prec-fully-dynamic-is-the-last-exact-resort', src: 'janux', path: '/depth/x/y/z', pattern: '/depth/[a]/[b]/[c]', params: { a: 'x', b: 'y', c: 'z' } },
  { id: 'prec-ambiguous-static-prefers-the-leftmost-static-route', src: 'janux', path: '/depth/fixed/fixed/y', pattern: '/depth/fixed/[b]/[c]', params: { b: 'fixed', c: 'y' } },
  { id: 'prec-rest-covers-depths-no-exact-route-has', src: 'janux', path: '/depth/x/y', pattern: '/depth/[...rest]', params: { rest: 'x/y' } },

  // ── optional catch-all is always the very last resort ───────────────────────
  { id: 'prec-index-beats-optional-catchall-for-zero-segments', src: 'next:route-sorter#index-over-optional', path: '/opt', pattern: '/opt', params: {} },
  { id: 'prec-static-leaf-beats-dynamic-and-optional', src: 'janux', path: '/opt/fixed', pattern: '/opt/fixed' },
  { id: 'prec-dynamic-beats-optional-for-one-segment', src: 'janux', path: '/opt/zzz', pattern: '/opt/[x]', params: { x: 'zzz' } },
  { id: 'prec-optional-takes-the-deep-leftovers', src: 'janux', path: '/opt/a/b', pattern: '/opt/[[...rest]]', params: { rest: 'a/b' } },
  { id: 'prec-optional-matches-zero-when-no-index-exists', src: 'janux', path: '/both', pattern: '/both/[[...opt]]', params: { opt: '' } },
  { id: 'prec-catchall-beats-optional-with-one-segment', src: 'janux', path: '/both/a', pattern: '/both/[...req]', params: { req: 'a' } },

  // ── a fixed tail fails late and the rest route picks up ─────────────────────
  { id: 'prec-fixed-tail-route-wins-when-the-tail-matches', src: 'janux', path: '/greedy/x/z', pattern: '/greedy/[g]/z', params: { g: 'x' } },
  { id: 'prec-tail-mismatch-backtracks-to-the-rest-route', src: 'kit:routing#backtracking', path: '/greedy/x/w', pattern: '/greedy/[...r]', params: { r: 'x/w' } },
  { id: 'prec-too-shallow-for-the-fixed-tail-falls-to-rest', src: 'janux', path: '/greedy/z', pattern: '/greedy/[...r]', params: { r: 'z' } },

  // ── encoding cannot promote a path into a static route ──────────────────────
  { id: 'prec-encoded-slash-cannot-smuggle-a-static-path', src: 'next:route-matcher#encoded-slash-priority', path: '/docs%2Fintro', pattern: '/[one]', params: { one: 'docs/intro' } },
  { id: 'prec-encoded-static-name-is-not-the-static-route', src: 'janux', path: '/%64ocs', pattern: '/[one]', params: { one: 'docs' } },
  { id: 'prec-case-mismatch-deep-falls-to-the-root-rest', src: 'janux', path: '/Typed/7', pattern: '/[...rest]', params: { rest: 'Typed/7' } },
  { id: 'prec-malformed-escape-rejects-even-the-optional-catchall', src: 'janux', path: '/%C3/x', pattern: null },

  // ── overshooting: an exact route never partially matches a deeper path ──────
  { id: 'prec-path-deeper-than-the-fixed-tail-falls-to-rest', src: 'janux', path: '/greedy/x/z/extra', pattern: '/greedy/[...r]', params: { r: 'x/z/extra' } },
  { id: 'prec-static-leaf-never-partially-matches-a-deeper-path', src: 'janux', path: '/opt/fixed/deep', pattern: '/opt/[[...rest]]', params: { rest: 'fixed/deep' } },
  { id: 'prec-dynamic-with-static-tail-never-overreaches', src: 'janux', path: '/docs/intro/edit/x', pattern: '/docs/[...path]', params: { path: 'intro/edit/x' } },
  { id: 'prec-full-static-chain-overshoots-to-the-top-rest', src: 'janux', path: '/mix/static/leaf/extra', pattern: '/mix/[...r]', params: { r: 'static/leaf/extra' } },
];

/**
 * The deterministic order itself: `createFsRouter(...).routes` must place
 * `before` strictly ahead of `after`. Matching only reveals the order between
 * routes an input reaches, so these rows pin the comparator directly — one row
 * per ordering rule, including the ties that alphabetical fallback decides.
 */
export interface OrderCase {
  before: string;
  after: string;
}

export type OrderRow = Case<OrderCase>;

export const ORDER_CASES: OrderRow[] = [
  { id: 'order-the-index-sorts-first', src: 'janux', before: '/', after: '/about' },
  { id: 'order-static-before-typed', src: 'next:route-sorter#kind-order', before: '/about', after: '/[num=integer]' },
  { id: 'order-typed-before-dynamic', src: 'kit:routing#sorting-matchers', before: '/[num=integer]', after: '/[one]' },
  { id: 'order-dynamic-before-catchall', src: 'next:route-sorter#catch-all-last', before: '/[one]', after: '/[...rest]' },
  { id: 'order-catchall-before-optional-catchall', src: 'next:route-sorter#optional-very-last', before: '/[...rest]', after: '/[[...all]]' },
  { id: 'order-dynamic-tie-breaks-on-pattern-text', src: 'janux', before: '/[one]', after: '/[two]' },
  { id: 'order-static-tie-breaks-alphabetically', src: 'janux', before: '/about', after: '/docs' },
  { id: 'order-nested-static-ties-stay-alphabetical', src: 'janux', before: '/docs/intro', after: '/mix/static' },
  { id: 'order-first-segment-dominates-whatever-follows', src: 'janux', before: '/opt/[[...rest]]', after: '/[num=integer]' },
  { id: 'order-static-second-segment-beats-dynamic-second', src: 'janux', before: '/mix/static/[id]', after: '/mix/[a]/leaf' },
  { id: 'order-exact-depth-beats-the-swallowing-rest', src: 'kit:routing#specific-before-spread', before: '/docs/[page]/edit', after: '/docs/[...path]' },
  { id: 'order-a-route-that-ends-first-wins-the-tie', src: 'janux', before: '/typed/new', after: '/mix/static/leaf' },
  { id: 'order-typed-parent-before-its-own-child', src: 'janux', before: '/typed/[id=integer]', after: '/typed/[id=integer]/edit' },
  { id: 'order-typed-branch-before-dynamic-branch-child', src: 'janux', before: '/typed/[id=integer]/edit', after: '/typed/[slug]' },
  { id: 'order-dynamic-parents-tie-alphabetically', src: 'janux', before: '/docs/[page]', after: '/mix/[a]' },
  { id: 'order-static-child-before-dynamic-child-of-the-same-parent', src: 'janux', before: '/mix/[a]/leaf', after: '/mix/[a]/[b]' },
  { id: 'order-depth-static-first-position-dominates', src: 'janux', before: '/depth/fixed/[b]/[c]', after: '/depth/[a]/fixed/[c]' },
  { id: 'order-depth-static-second-position-dominates', src: 'janux', before: '/depth/[a]/fixed/[c]', after: '/depth/[a]/[b]/fixed' },
  { id: 'order-depth-static-third-position-dominates', src: 'janux', before: '/depth/[a]/[b]/fixed', after: '/depth/[a]/[b]/[c]' },
  { id: 'order-exact-dynamic-before-the-catchall-sibling', src: 'janux', before: '/depth/[a]/[b]/[c]', after: '/depth/[...rest]' },
  { id: 'order-catchall-ties-stay-alphabetical', src: 'janux', before: '/both/[...req]', after: '/depth/[...rest]' },
  { id: 'order-fixed-tail-before-the-rest-sibling', src: 'janux', before: '/greedy/[g]/z', after: '/greedy/[...r]' },
  { id: 'order-nested-catchall-before-the-root-catchall', src: 'janux', before: '/mix/[...r]', after: '/[...rest]' },
  { id: 'order-segment-kind-beats-alphabet', src: 'janux', before: '/mix/[...r]', after: '/both/[[...opt]]' },
  // The full kind matrix, not just adjacent pairs — a scoring regression could
  // reorder a non-adjacent pair while every adjacent one still passes.
  { id: 'order-static-before-dynamic', src: 'next:route-sorter#kind-matrix', before: '/about', after: '/[one]' },
  { id: 'order-static-before-catchall', src: 'janux', before: '/about', after: '/[...rest]' },
  { id: 'order-static-before-optional-catchall', src: 'janux', before: '/about', after: '/[[...all]]' },
  { id: 'order-typed-before-catchall', src: 'janux', before: '/[num=integer]', after: '/[...rest]' },
  { id: 'order-typed-before-optional-catchall', src: 'janux', before: '/[num=integer]', after: '/[[...all]]' },
  { id: 'order-dynamic-before-optional-catchall', src: 'janux', before: '/[one]', after: '/[[...all]]' },
];
