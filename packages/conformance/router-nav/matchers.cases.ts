import type { Case } from '../support/case';

/**
 * Custom typed matchers, registered via `createFsRouter(dir, matchers)` — the
 * `src/matchers.ts` convention from docs guide/navigation.md. The registered
 * functions for these cases:
 *
 *   slug:    /^[a-z0-9-]+$/          (the docs' own example)
 *   hex:     /^[0-9a-f]+$/           (deliberately case-strict)
 *   date:    /^\d{4}-\d{2}-\d{2}$/
 *   integer: even numbers only       (OVERRIDES the built-in)
 *
 * Pinned here: matchers test the *decoded* value, a custom `integer` replaces
 * the built-in outright (no merging of verdicts), other built-ins survive
 * registration, an unknown matcher name makes its route unmatchable rather than
 * throwing, and two typed siblings order by pattern text. Cases follow
 * `kit:routing#matchers`.
 *
 * The fixture tree in `__fixtures__/matchers`:
 *   /slugged/[s=slug]  /hex/[h=hex]  /date/[d=date]  /over/[n=integer]
 *   /dead/[x=nope]     /still/[k=uuid]  /mixed/[v=hex]/[w]
 *   /two/[a=hex]  /two/[b=date]
 */
export interface MatcherCase {
  path: string;
  pattern: string | null;
  params?: Record<string, string>;
}

export type MatcherRow = Case<MatcherCase>;

export const MATCHER_CASES: MatcherRow[] = [
  // ── the docs' slug example, verbatim ────────────────────────────────────────
  { id: 'matcher-docs-slug-example-accepts', src: 'janux', path: '/slugged/a-b-1', pattern: '/slugged/[s=slug]', params: { s: 'a-b-1' } },
  { id: 'matcher-docs-slug-example-rejects-uppercase', src: 'janux', path: '/slugged/A-b', pattern: null },
  { id: 'matcher-slug-rejects-an-underscore', src: 'janux', path: '/slugged/a_b', pattern: null },
  { id: 'matcher-slug-rejects-a-dot', src: 'janux', path: '/slugged/a.b', pattern: null },
  { id: 'matcher-slug-dash-only-still-matches', src: 'janux', path: '/slugged/-', pattern: '/slugged/[s=slug]', params: { s: '-' } },

  // ── matchers see the decoded value ──────────────────────────────────────────
  { id: 'matcher-custom-hex-accepts-lowercase', src: 'janux', path: '/hex/deadbeef', pattern: '/hex/[h=hex]', params: { h: 'deadbeef' } },
  { id: 'matcher-custom-hex-is-as-strict-as-written', src: 'janux', path: '/hex/DEADBEEF', pattern: null },
  { id: 'matcher-custom-receives-the-decoded-value', src: 'kit:routing#matcher-decoded', path: '/hex/%64eadbeef', pattern: '/hex/[h=hex]', params: { h: 'deadbeef' } },
  { id: 'matcher-custom-hex-rejects-non-hex', src: 'janux', path: '/hex/xyz', pattern: null },
  { id: 'matcher-verdict-applies-to-the-decoded-unicode-value', src: 'janux', path: '/hex/caf%C3%A9', pattern: null },
  { id: 'matcher-date-shaped-value-accepts', src: 'janux', path: '/date/2026-07-31', pattern: '/date/[d=date]', params: { d: '2026-07-31' } },
  { id: 'matcher-date-unpadded-value-rejects', src: 'janux', path: '/date/2026-7-31', pattern: null },
  { id: 'matcher-date-checks-shape-not-calendar-validity', src: 'janux', path: '/date/2026-99-99', pattern: '/date/[d=date]', params: { d: '2026-99-99' } },
  { id: 'matcher-date-encoded-dashes-decode-first', src: 'janux', path: '/date/2026%2D07%2D31', pattern: '/date/[d=date]', params: { d: '2026-07-31' } },

  // ── overriding and surviving the built-ins ──────────────────────────────────
  { id: 'matcher-override-replaces-the-builtin', src: 'janux', path: '/over/4', pattern: '/over/[n=integer]', params: { n: '4' } },
  { id: 'matcher-override-is-total-not-merged', src: 'janux', path: '/over/3', pattern: null },
  { id: 'matcher-builtins-survive-custom-registration', src: 'janux', path: '/still/3f2504e0-4f89-11d3-9a0c-0305e82c3301', pattern: '/still/[k=uuid]', params: { k: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' } },

  // ── an unknown matcher name: unmatchable, never a throw ─────────────────────
  { id: 'matcher-unknown-name-never-matches', src: 'janux', path: '/dead/x', pattern: null },
  { id: 'matcher-unknown-name-rejects-any-value-shape', src: 'janux', path: '/dead/42', pattern: null },

  // ── typed segments chained with dynamic ones ────────────────────────────────
  { id: 'matcher-typed-then-dynamic-chain', src: 'janux', path: '/mixed/ff/anything', pattern: '/mixed/[v=hex]/[w]', params: { v: 'ff', w: 'anything' } },
  { id: 'matcher-typed-gate-rejects-before-the-dynamic-child', src: 'janux', path: '/mixed/GG/anything', pattern: null },
  { id: 'matcher-typed-gate-then-encoded-dynamic-value', src: 'janux', path: '/mixed/ab/x%20y', pattern: '/mixed/[v=hex]/[w]', params: { v: 'ab', w: 'x y' } },

  // ── two typed siblings: pattern text breaks the tie, verdicts route ─────────
  { id: 'matcher-typed-siblings-first-verdict-wins', src: 'janux', path: '/two/abc123', pattern: '/two/[a=hex]', params: { a: 'abc123' } },
  { id: 'matcher-typed-siblings-fall-through-by-verdict', src: 'janux', path: '/two/2026-07-31', pattern: '/two/[b=date]', params: { b: '2026-07-31' } },
  { id: 'matcher-typed-siblings-both-reject-is-a-404', src: 'janux', path: '/two/nope!', pattern: null },
];
