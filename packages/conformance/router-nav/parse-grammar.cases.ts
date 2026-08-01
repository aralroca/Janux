import type { Case } from '../support/case';

/**
 * The segment grammar parser itself, observed through `createFsRouter(...).routes`:
 * what kind each file-name segment parses to, which param name it captures, and
 * which matcher it references. Matching cases can only reveal parsing indirectly;
 * these rows pin it directly, including the degenerate spellings (`[half`, `[]`,
 * `a[b]c`) that must fall back to static rather than half-parse. Cases follow
 * `kit:routing#parse` and `next:route-regex`.
 */
export interface GrammarCase {
  fixture: 'routes' | 'precedence' | 'decoding' | 'rest' | 'matchers' | 'conventions';
  pattern: string;
  /** Per segment: `[kind, name, matcher]` with `null` where the field does not apply. */
  segments: [string, string | null, string | null][];
}

export type GrammarRow = Case<GrammarCase>;

export const GRAMMAR_CASES: GrammarRow[] = [
  { id: 'gram-index-has-zero-segments', src: 'janux', fixture: 'routes', pattern: '/', segments: [] },
  { id: 'gram-static-segment', src: 'janux', fixture: 'routes', pattern: '/about', segments: [['static', null, null]] },
  { id: 'gram-dynamic-segment-captures-its-name', src: 'janux', fixture: 'routes', pattern: '/blog/[slug]', segments: [['static', null, null], ['dynamic', 'slug', null]] },
  { id: 'gram-typed-segment-splits-name-and-matcher', src: 'kit:routing#parse-matcher', fixture: 'routes', pattern: '/users/[id=integer]', segments: [['static', null, null], ['typed', 'id', 'integer']] },
  { id: 'gram-catchall-segment', src: 'janux', fixture: 'routes', pattern: '/files/[...path]', segments: [['static', null, null], ['catchall', 'path', null]] },
  { id: 'gram-optional-catchall-segment', src: 'janux', fixture: 'routes', pattern: '/wild/[[...rest]]', segments: [['static', null, null], ['optional', 'rest', null]] },
  { id: 'gram-group-directories-leave-no-segment', src: 'next:route-regex#groups', fixture: 'routes', pattern: '/pricing', segments: [['static', null, null]] },
  { id: 'gram-two-dynamic-names-in-one-chain', src: 'janux', fixture: 'decoding', pattern: '/pair/[a]/[b]', segments: [['static', null, null], ['dynamic', 'a', null], ['dynamic', 'b', null]] },
  { id: 'gram-typed-then-catchall-chain', src: 'janux', fixture: 'rest', pattern: '/tnum/[n=integer]/[...tail]', segments: [['static', null, null], ['typed', 'n', 'integer'], ['catchall', 'tail', null]] },
  { id: 'gram-proto-parses-as-an-ordinary-name', src: 'janux', fixture: 'decoding', pattern: '/pkey/[__proto__]', segments: [['static', null, null], ['dynamic', '__proto__', null]] },
  { id: 'gram-unknown-matcher-name-parses-fine', src: 'janux', fixture: 'matchers', pattern: '/dead/[x=nope]', segments: [['static', null, null], ['typed', 'x', 'nope']] },
  { id: 'gram-half-open-bracket-is-static', src: 'janux', fixture: 'conventions', pattern: '/[half/x', segments: [['static', null, null], ['static', null, null]] },
  { id: 'gram-empty-brackets-are-static', src: 'janux', fixture: 'conventions', pattern: '/[]/y', segments: [['static', null, null], ['static', null, null]] },
  { id: 'gram-brackets-mid-name-are-static', src: 'janux', fixture: 'conventions', pattern: '/a[b]c', segments: [['static', null, null]] },
  { id: 'gram-dots-in-a-name-are-static', src: 'janux', fixture: 'conventions', pattern: '/v1.2', segments: [['static', null, null]] },
];
