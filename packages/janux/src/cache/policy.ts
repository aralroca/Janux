/**
 * The route cache policy: declared data, not a middleware decision.
 *
 * A route says what its response is worth to a cache the same way it says what
 * its `meta` is — a named export the server reads. Nothing here is a closure,
 * so the policy is describable (the manifest can carry it) and a build step
 * could hoist it; tag templates use the router's own `[param]` grammar instead
 * of a function for exactly that reason.
 *
 * Everything defaults to private. A response that nobody classified is a
 * response that may carry a session, and the one guarantee worth more than any
 * hit rate is that we never hand one of those to a shared cache.
 */
import { parseDuration } from '../define/factories';

export type CacheScope = 'private' | 'public';

/** What a route's `cache` export is written as. */
export interface CachePolicyDef {
  /** Names the policy so it can be shared between routes and read in a manifest. */
  name: string;
  /** `'public'` opts into shared caches (CDNs). Default `'private'`. */
  scope?: CacheScope;
  /** Browser freshness → `max-age`. `'5m'` or milliseconds. */
  maxAge?: string | number;
  /** Shared-cache freshness → `s-maxage`. Public policies only. */
  sharedMaxAge?: string | number;
  /** How long a stale response may still be served while it revalidates → `stale-while-revalidate`. Public policies only. */
  swr?: string | number;
  /** Tags for on-demand revalidation. `[param]` is filled from the matched route params. */
  tags?: string[];
}

/** A validated, frozen policy. Durations are milliseconds, like every other duration in the framework. */
export interface CachePolicy {
  name: string;
  scope: CacheScope;
  maxAgeMs: number;
  sharedMaxAgeMs: number;
  swrMs: number;
  tags: readonly string[];
}

export interface CacheHeadersOptions {
  /** Matched route params, for `[param]` tag templates. */
  params?: Record<string, string>;
  /** Header the CDN in front reads tags from. Default `Cache-Tag` (Cloudflare, Akamai). */
  tagHeader?: string;
  /** Request headers the response body depends on — emitted as `Vary` for shared caches. */
  vary?: string[];
}

const FAIL_SAFE = 'private, no-store';
const DEFAULT_TAG_HEADER = 'Cache-Tag';
/** Fastly splits on spaces; everyone else on commas. Keyed by the lowercased header name. */
const SPACE_SEPARATED = new Set(['surrogate-key']);
const TAG_PARAM = /\[([^\]]+)\]/g;

function durationMs(value: string | number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') return parseDuration(value);
  if (!Number.isFinite(value)) throw new Error(`Janux: cache ${field} must be a finite duration`);
  if (value < 0) throw new Error(`Janux: cache ${field} cannot be negative`);

  return value;
}

/**
 * Declares a named cache policy, validating it where the mistake is cheap to
 * fix. `s-maxage` and `stale-while-revalidate` only mean anything to a shared
 * cache, so asking for either on a private policy is a contradiction the author
 * wants to hear about at boot rather than to discover as a cache miss forever.
 */
export function cachePolicy(def: CachePolicyDef): CachePolicy {
  if (!def.name?.trim()) throw new Error('Janux: cachePolicy() requires a name');
  const scope = def.scope ?? 'private';

  if (scope === 'private') {
    (['sharedMaxAge', 'swr'] as const).forEach((field) => {
      if (def[field] !== undefined) {
        throw new Error(`Janux: cache policy "${def.name}" is private, so ${field} would never apply — set scope: 'public'`);
      }
    });
  }

  return Object.freeze({
    name: def.name,
    scope,
    maxAgeMs: durationMs(def.maxAge, 'maxAge'),
    sharedMaxAgeMs: durationMs(def.sharedMaxAge, 'sharedMaxAge'),
    swrMs: durationMs(def.swr, 'swr'),
    tags: Object.freeze([...(def.tags ?? [])]),
  });
}

const seconds = (ms: number): number => Math.floor(ms / 1000);

/**
 * Resolves `[param]` templates against the matched route params. A template
 * whose param the request cannot fill is dropped rather than emitted with the
 * brackets intact: `product:[id]` as a literal tag would be purged by nobody
 * and would silently pin the entry forever.
 */
export function resolveTags(policy: CachePolicy, params: Record<string, string> = {}): string[] {
  return policy.tags.filter((tag) => ![...tag.matchAll(TAG_PARAM)].some((match) => params[match[1]!] === undefined))
    .map((tag) => tag.replace(TAG_PARAM, (_raw, param: string) => params[param]!));
}

/**
 * The response headers a policy is worth. An absent policy is the fail-safe:
 * `private, no-store`, so a route that never thought about caching cannot be
 * the one that leaks a session through a CDN.
 *
 * `no-store` costs Chrome's bfcache; a route that wants back/forward restores
 * without opting into any storage says so with `cachePolicy({ name })` plus
 * `maxAge: 0`, which emits `private, max-age=0` instead.
 */
export function cacheHeaders(
  policy: CachePolicy | undefined,
  options: CacheHeadersOptions = {},
): Record<string, string> {
  if (!policy) return { 'cache-control': FAIL_SAFE };

  const directives = [policy.scope, `max-age=${seconds(policy.maxAgeMs)}`];

  if (policy.scope === 'private') return { 'cache-control': directives.join(', ') };
  directives.push(`s-maxage=${seconds(policy.sharedMaxAgeMs)}`);
  if (policy.swrMs > 0) directives.push(`stale-while-revalidate=${seconds(policy.swrMs)}`);

  const tags = resolveTags(policy, options.params);
  const tagHeader = options.tagHeader ?? DEFAULT_TAG_HEADER;
  const separator = SPACE_SEPARATED.has(tagHeader.toLowerCase()) ? ' ' : ', ';

  return {
    'cache-control': directives.join(', '),
    ...(tags.length > 0 ? { [tagHeader.toLowerCase()]: tags.join(separator) } : {}),
    ...(options.vary?.length ? { vary: options.vary.join(', ') } : {}),
  };
}
