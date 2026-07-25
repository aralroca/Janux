import type { Case } from '../support/case';

/**
 * File-system route matching.
 *
 * Routing is where frameworks accumulate the most reported bugs, because the
 * grammar is small but the input is attacker-controlled: precedence between
 * segment kinds, `(group)` directories that must not touch the URL, rest
 * segments that must not swallow an exact match, percent-encoding, and paths
 * that are simply malformed. Cases follow `next:route-matcher`,
 * `angular:router`, `astro:routing` and `kit`.
 *
 * The fixture tree in `__fixtures__/routes` provides:
 *   /                       index.tsx
 *   /about                  about.tsx
 *   /pricing                (marketing)/pricing.tsx
 *   /docs                   (marketing)/docs/index.tsx
 *   /blog                   blog/index.tsx
 *   /blog/latest            blog/latest.tsx        (static beats dynamic)
 *   /blog/[slug]            blog/[slug].tsx
 *   /files/[...path]        catch-all, needs ≥1 segment
 *   /wild/[[...rest]]       optional catch-all, matches 0 segments too
 *   /shop/[id]              shop/[id]/index.tsx
 *   /shop/[id]/edit         shop/[id]/edit.tsx
 *   /users/[id=integer]     typed
 *   /users/[uid=uuid]       typed
 */
export interface MatchCase {
  path: string;
  /** The route pattern that must win, or `null` for no match. */
  pattern: string | null;
  /** Params the match must yield; omitted means `{}`. */
  params?: Record<string, string>;
}

export type MatchRow = Case<MatchCase>;

export const MATCH_CASES: MatchRow[] = [
  // ── static ──────────────────────────────────────────────────────────────────
  { id: 'route-root-index', src: 'next:route-matcher#index', path: '/', pattern: '/' },
  { id: 'route-static-top-level', src: 'next:route-matcher#static', path: '/about', pattern: '/about' },
  { id: 'route-unknown-static-does-not-match', src: 'next:route-matcher#404', path: '/nope', pattern: null },
  { id: 'route-static-is-case-sensitive', src: 'astro:routing#case-sensitivity', path: '/About', pattern: null },
  { id: 'route-trailing-slash-is-ignored', src: 'kit:routing#trailing-slash', path: '/about/', pattern: '/about' },
  { id: 'route-double-slash-collapses', src: 'janux', path: '//about', pattern: '/about' },
  { id: 'route-many-slashes-collapse', src: 'janux', path: '///about///', pattern: '/about' },
  { id: 'route-empty-path-is-the-index', src: 'janux', path: '', pattern: '/' },
  { id: 'route-deeper-path-does-not-match-a-shallow-static', src: 'janux', path: '/about/extra', pattern: null },

  // ── (group) directories are invisible in the URL ─────────────────────────────
  { id: 'route-group-directory-does-not-appear-in-the-url', src: 'next:route-matcher#route-groups', path: '/pricing', pattern: '/pricing' },
  { id: 'route-group-directory-name-is-not-matchable', src: 'next:route-matcher#group-not-in-url', path: '/(marketing)/pricing', pattern: null },
  { id: 'route-group-with-a-nested-index', src: 'janux', path: '/docs', pattern: '/docs' },

  // ── index inside a directory ─────────────────────────────────────────────────
  { id: 'route-directory-index', src: 'astro:routing#directory-index', path: '/blog', pattern: '/blog' },
  { id: 'route-nested-index-under-a-dynamic-segment', src: 'janux', path: '/shop/abc', pattern: '/shop/[id]', params: { id: 'abc' } },

  // ── precedence ──────────────────────────────────────────────────────────────
  { id: 'route-static-beats-dynamic-sibling', src: 'next:route-matcher#static-before-dynamic', path: '/blog/latest', pattern: '/blog/latest' },
  { id: 'route-dynamic-catches-the-rest', src: 'next:route-matcher#dynamic', path: '/blog/hello', pattern: '/blog/[slug]', params: { slug: 'hello' } },
  { id: 'route-static-suffix-beats-the-index-under-a-dynamic-parent', src: 'janux', path: '/shop/abc/edit', pattern: '/shop/[id]/edit', params: { id: 'abc' } },

  // ── typed matchers ──────────────────────────────────────────────────────────
  { id: 'route-typed-integer-matches-digits', src: 'kit:routing#matchers', path: '/users/42', pattern: '/users/[id=integer]', params: { id: '42' } },
  { id: 'route-typed-integer-rejects-a-word-and-falls-through-to-uuid', src: 'kit:routing#matcher-rejects', path: '/users/bob', pattern: null },
  { id: 'route-typed-uuid-matches-a-uuid', src: 'janux', path: '/users/3f2504e0-4f89-11d3-9a0c-0305e82c3301', pattern: '/users/[uid=uuid]', params: { uid: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' } },
  { id: 'route-typed-uuid-is-case-insensitive', src: 'janux', path: '/users/3F2504E0-4F89-11D3-9A0C-0305E82C3301', pattern: '/users/[uid=uuid]', params: { uid: '3F2504E0-4F89-11D3-9A0C-0305E82C3301' } },
  { id: 'route-typed-integer-rejects-a-negative-number', src: 'janux', path: '/users/-1', pattern: null },
  { id: 'route-typed-integer-rejects-a-float', src: 'janux', path: '/users/1.5', pattern: null },
  { id: 'route-typed-integer-rejects-leading-plus', src: 'janux', path: '/users/+1', pattern: null },
  { id: 'route-typed-integer-accepts-leading-zeros', src: 'janux', path: '/users/007', pattern: '/users/[id=integer]', params: { id: '007' } },
  { id: 'route-typed-integer-rejects-full-width-digits', src: 'janux', path: '/users/４２', pattern: null },
  { id: 'route-typed-integer-rejects-an-arabic-indic-digit', src: 'janux', path: '/users/٤٢', pattern: null },

  // ── catch-all ───────────────────────────────────────────────────────────────
  { id: 'route-catchall-takes-one-segment', src: 'next:route-matcher#catch-all', path: '/files/a', pattern: '/files/[...path]', params: { path: 'a' } },
  { id: 'route-catchall-joins-many-segments', src: 'next:route-matcher#catch-all-multi', path: '/files/a/b/c', pattern: '/files/[...path]', params: { path: 'a/b/c' } },
  { id: 'route-catchall-needs-at-least-one-segment', src: 'next:route-matcher#catch-all-requires-one', path: '/files', pattern: null },
  { id: 'route-optional-catchall-matches-zero-segments', src: 'next:route-matcher#optional-catch-all', path: '/wild', pattern: '/wild/[[...rest]]', params: { rest: '' } },
  { id: 'route-optional-catchall-matches-one-segment', src: 'janux', path: '/wild/a', pattern: '/wild/[[...rest]]', params: { rest: 'a' } },
  { id: 'route-optional-catchall-matches-many-segments', src: 'janux', path: '/wild/a/b', pattern: '/wild/[[...rest]]', params: { rest: 'a/b' } },

  // ── percent-encoding ────────────────────────────────────────────────────────
  { id: 'route-param-is-percent-decoded', src: 'next:route-matcher#decoded-params', path: '/blog/hello%20world', pattern: '/blog/[slug]', params: { slug: 'hello world' } },
  { id: 'route-param-decodes-an-encoded-slash-into-one-segment', src: 'astro:routing#encoded-slash', path: '/blog/a%2Fb', pattern: '/blog/[slug]', params: { slug: 'a/b' } },
  { id: 'route-param-decodes-utf8', src: 'janux', path: '/blog/caf%C3%A9', pattern: '/blog/[slug]', params: { slug: 'café' } },
  { id: 'route-param-decodes-emoji', src: 'janux', path: '/blog/%F0%9F%8E%89', pattern: '/blog/[slug]', params: { slug: '🎉' } },
  { id: 'route-param-decodes-a-plus-literally-not-as-a-space', src: 'janux', path: '/blog/a+b', pattern: '/blog/[slug]', params: { slug: 'a+b' } },
  { id: 'route-catchall-decodes-every-segment', src: 'janux', path: '/files/a%20b/c%20d', pattern: '/files/[...path]', params: { path: 'a b/c d' } },
  { id: 'route-static-segment-is-compared-before-decoding', src: 'janux', path: '/%61bout', pattern: null },

  // ── malformed input must 404, never throw ───────────────────────────────────
  { id: 'route-lone-percent-does-not-match', src: 'janux', path: '/%', pattern: null },
  { id: 'route-invalid-hex-escape-does-not-match', src: 'janux', path: '/blog/%zz', pattern: null },
  { id: 'route-truncated-utf8-escape-does-not-match', src: 'janux', path: '/blog/%E0%A4%A', pattern: null },
  { id: 'route-malformed-escape-in-a-catchall-does-not-match', src: 'janux', path: '/files/ok/%E0', pattern: null },
  { id: 'route-malformed-escape-does-not-break-a-static-route', src: 'janux', path: '/about%', pattern: null },
  { id: 'route-malformed-escape-in-a-later-segment-leaves-static-alone', src: 'janux', path: '/blog/latest/%', pattern: null },

  // ── traversal and exotic segments arrive as plain params ────────────────────
  { id: 'route-dot-dot-is-a-segment-so-it-cannot-climb-to-a-static-route', src: 'janux', path: '/../about', pattern: null },
  { id: 'route-dot-dot-is-captured-as-an-ordinary-param', src: 'janux', path: '/blog/..', pattern: '/blog/[slug]', params: { slug: '..' } },
  { id: 'route-encoded-dot-dot-is-decoded-into-a-param', src: 'janux', path: '/blog/%2E%2E', pattern: '/blog/[slug]', params: { slug: '..' } },
  { id: 'route-single-dot-is-captured-as-a-param', src: 'janux', path: '/blog/.', pattern: '/blog/[slug]', params: { slug: '.' } },
  { id: 'route-traversal-in-a-catchall-stays-in-the-param', src: 'janux', path: '/files/../../etc/passwd', pattern: '/files/[...path]', params: { path: '../../etc/passwd' } },
  { id: 'route-nul-byte-in-a-param-is-decoded-not-truncated', src: 'janux', path: '/blog/a%00b', pattern: '/blog/[slug]', params: { slug: 'a\u0000b' } },
  { id: 'route-newline-in-a-param', src: 'janux', path: '/blog/a%0Ab', pattern: '/blog/[slug]', params: { slug: 'a\nb' } },
  { id: 'route-param-may-look-like-a-segment-pattern', src: 'janux', path: '/blog/[slug]', pattern: '/blog/[slug]', params: { slug: '[slug]' } },
  { id: 'route-param-may-be-a-very-long-string', src: 'janux', path: `/blog/${'a'.repeat(2000)}`, pattern: '/blog/[slug]', params: { slug: 'a'.repeat(2000) } },
];
