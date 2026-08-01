import type { Case } from '../support/case';
import type { CachePolicyDef, CacheHeadersOptions } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';
import { cachePolicy, cacheHeaders } from 'janux';

/**
 * The route cache policy: declared data validated at boot, emitted once as
 * headers, honoured twice (by the CDN and by the in-process response cache).
 * Everything here defaults towards `private` — the one guarantee worth more
 * than any hit rate is that an unclassified response never reaches a shared
 * cache.
 */

/** A policy definition that must be rejected at declaration time. */
export interface PolicyErrorCase {
  def: CachePolicyDef;
  error: string;
}

export const POLICY_ERROR_CASES: Case<PolicyErrorCase>[] = [
  {
    id: 'cache-policy-requires-a-name',
    src: 'janux',
    def: { name: '' },
    error: 'Janux: cachePolicy() requires a name',
  },
  {
    id: 'cache-policy-a-whitespace-name-is-no-name',
    src: 'janux',
    def: { name: '   ' },
    error: 'Janux: cachePolicy() requires a name',
  },
  {
    id: 'cache-policy-private-with-shared-max-age-is-a-contradiction',
    src: 'janux',
    def: { name: 'contradiction', sharedMaxAge: '5m' },
    error: "Janux: cache policy \"contradiction\" is private, so sharedMaxAge would never apply — set scope: 'public'",
  },
  {
    id: 'cache-policy-private-with-swr-is-a-contradiction',
    src: 'janux',
    def: { name: 'contradiction', swr: '5m' },
    error: "Janux: cache policy \"contradiction\" is private, so swr would never apply — set scope: 'public'",
  },
  {
    id: 'cache-policy-a-negative-duration-is-rejected',
    src: 'janux',
    def: { name: 'negative', maxAge: -1 },
    error: 'Janux: cache maxAge cannot be negative',
  },
  {
    id: 'cache-policy-a-non-finite-duration-is-rejected',
    src: 'janux',
    def: { name: 'infinite', maxAge: Number.POSITIVE_INFINITY },
    error: 'Janux: cache maxAge must be a finite duration',
  },
  {
    id: 'cache-policy-a-malformed-duration-string-is-rejected',
    src: 'janux',
    def: { name: 'typo', maxAge: '5 minutes' },
    error: 'Janux: invalid duration "5 minutes" (use e.g. 300ms, 2s, 5m, 1h)',
  },
];

/** A policy plus the exact header set it is worth. */
export interface PolicyHeadersCase {
  /** Absent means "route never declared a policy" — the fail-safe. */
  def?: CachePolicyDef;
  options?: CacheHeadersOptions;
  headers: Record<string, string>;
}

export const POLICY_HEADER_CASES: Case<PolicyHeadersCase>[] = [
  {
    id: 'cache-policy-an-absent-policy-fails-safe-to-private-no-store',
    src: 'janux',
    headers: { 'cache-control': 'private, no-store' },
  },
  {
    id: 'cache-policy-the-default-scope-is-private',
    src: 'janux',
    def: { name: 'unspoken', maxAge: '5m' },
    headers: { 'cache-control': 'private, max-age=300' },
  },
  {
    id: 'cache-policy-private-with-max-age-zero-keeps-bfcache-without-storing',
    src: 'janux',
    def: { name: 'bfcache-friendly', maxAge: 0 },
    headers: { 'cache-control': 'private, max-age=0' },
  },
  {
    id: 'cache-policy-a-private-policy-emits-no-shared-directives-and-no-tags',
    src: 'janux',
    def: { name: 'personal', maxAge: '1m', tags: ['user'] },
    headers: { 'cache-control': 'private, max-age=60' },
  },
  {
    id: 'cache-policy-a-public-policy-emits-s-maxage',
    src: 'janux',
    def: { name: 'shared', scope: 'public', maxAge: '1m', sharedMaxAge: '10m' },
    headers: { 'cache-control': 'public, max-age=60, s-maxage=600' },
  },
  {
    id: 'cache-policy-swr-appears-only-when-positive',
    src: 'janux',
    def: { name: 'no-swr', scope: 'public', sharedMaxAge: '10m', swr: 0 },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=600' },
  },
  {
    id: 'cache-policy-swr-emits-stale-while-revalidate-in-seconds',
    src: 'janux',
    def: { name: 'swr', scope: 'public', sharedMaxAge: '1m', swr: '1h' },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=3600' },
  },
  {
    id: 'cache-policy-durations-are-floored-to-whole-seconds',
    src: 'janux',
    def: { name: 'sub-second', maxAge: 1_999 },
    headers: { 'cache-control': 'private, max-age=1' },
  },
  {
    id: 'cache-policy-tags-emit-on-the-default-cache-tag-header',
    src: 'janux',
    def: { name: 'tagged', scope: 'public', sharedMaxAge: '1m', tags: ['catalog', 'homepage'] },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'cache-tag': 'catalog, homepage' },
  },
  {
    id: 'cache-policy-a-custom-tag-header-is-emitted-lowercased',
    src: 'janux',
    def: { name: 'custom-header', scope: 'public', sharedMaxAge: '1m', tags: ['catalog'] },
    options: { tagHeader: 'X-Cache-Tags' },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'x-cache-tags': 'catalog' },
  },
  {
    id: 'cache-policy-surrogate-key-joins-tags-with-spaces-for-fastly',
    src: 'janux',
    def: { name: 'fastly', scope: 'public', sharedMaxAge: '1m', tags: ['catalog', 'homepage'] },
    options: { tagHeader: 'Surrogate-Key' },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'surrogate-key': 'catalog homepage' },
  },
  {
    id: 'cache-policy-a-tag-template-is-filled-from-the-route-params',
    src: 'janux',
    def: { name: 'per-product', scope: 'public', sharedMaxAge: '1m', tags: ['product:[id]'] },
    options: { params: { id: '42' } },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'cache-tag': 'product:42' },
  },
  {
    id: 'cache-policy-a-template-missing-its-param-is-dropped-not-emitted-literally',
    src: 'janux',
    def: { name: 'orphan-template', scope: 'public', sharedMaxAge: '1m', tags: ['product:[id]', 'catalog'] },
    options: { params: {} },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'cache-tag': 'catalog' },
  },
  {
    id: 'cache-policy-a-template-with-two-params-fills-both',
    src: 'janux',
    def: { name: 'two-params', scope: 'public', sharedMaxAge: '1m', tags: ['shop:[shop]:product:[id]'] },
    options: { params: { shop: 'main', id: '7' } },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', 'cache-tag': 'shop:main:product:7' },
  },
  {
    id: 'cache-policy-no-tag-header-is-emitted-when-nothing-resolves',
    src: 'janux',
    def: { name: 'no-tags', scope: 'public', sharedMaxAge: '1m', tags: ['product:[id]'] },
    options: { params: {} },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60' },
  },
  {
    id: 'cache-policy-vary-is-emitted-for-public-policies',
    src: 'janux',
    def: { name: 'varied', scope: 'public', sharedMaxAge: '1m' },
    options: { vary: ['accept-language', 'x-theme'] },
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60', vary: 'accept-language, x-theme' },
  },
  {
    id: 'cache-policy-vary-is-not-emitted-for-private-policies',
    src: 'janux',
    def: { name: 'private-varied', maxAge: '1m' },
    options: { vary: ['accept-language'] },
    headers: { 'cache-control': 'private, max-age=60' },
  },
];

export const POLICY_IMMUTABILITY_CASES: ScenarioCase[] = [
  {
    id: 'cache-policy-the-declared-policy-is-frozen',
    src: 'janux',
    run: (log) => {
      const policy = cachePolicy({ name: 'sealed', maxAge: '1m' });

      attempt(log, 'reassign', () => ((policy as { maxAgeMs: number }).maxAgeMs = 0));
      log.push(`maxAgeMs:${policy.maxAgeMs}`);
    },
    expected: [
      "reassign:threw:Attempted to assign to readonly property.",
      'maxAgeMs:60000',
    ],
  },
  {
    id: 'cache-policy-the-tags-array-is-copied-and-frozen',
    src: 'janux',
    run: (log) => {
      const declared = ['catalog'];
      const policy = cachePolicy({ name: 'copied', scope: 'public', tags: declared });

      declared.push('sneaky');
      attempt(log, 'push', () => (policy.tags as string[]).push('sneakier'));
      log.push(`tags:${policy.tags.join(',')}`);
    },
    expected: [
      'push:threw:Attempted to assign to readonly property.',
      'tags:catalog',
    ],
  },
  {
    id: 'cache-policy-headers-of-a-declared-policy-and-the-fail-safe-never-mix',
    src: 'janux',
    run: (log) => {
      const policy = cachePolicy({ name: 'declared', scope: 'public', sharedMaxAge: '1m' });

      log.push(`declared:${cacheHeaders(policy)['cache-control']}`);
      log.push(`undeclared:${cacheHeaders(undefined)['cache-control']}`);
    },
    expected: ['declared:public, max-age=0, s-maxage=60', 'undeclared:private, no-store'],
  },
];
