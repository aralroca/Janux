import { cacheHeaders, type CacheConfig, type CachePolicy } from 'janux';

export type { CacheConfig };

export interface CacheDecision {
  policy?: CachePolicy;
  params?: Record<string, string>;
  /** Request headers this body varies on — only meaningful once it is shareable. */
  vary?: string[];
}

/**
 * The one place a response's cacheability is decided, so no route has to be
 * trusted to get it right (invariant 4: the pipeline enforces, not app code).
 *
 * The guard that matters: a response carrying `Set-Cookie` is never shareable,
 * whatever it declared. Handing one to a CDN serves one visitor's session to
 * everyone behind it — the single worst bug this feature could ship, and far
 * too easy to write by accident when a public policy outlives the page that
 * earned it.
 */
export function cacheHeadersFor(decision: CacheDecision, config: CacheConfig = {}, setsCookie = false): Record<string, string> {
  const { policy, params, vary } = decision;

  if (setsCookie && policy?.scope === 'public') {
    console.warn(
      `Janux: cache policy "${policy.name}" is public but the response carries a set-cookie — downgraded to private, no-store`,
    );

    return cacheHeaders(undefined);
  }

  return cacheHeaders(policy, { params, vary, tagHeader: config.tagHeader });
}

/** Applies a decision onto a response the app built (handlers own their `Response`). */
export function withCacheHeaders(res: Response, decision: CacheDecision, config?: CacheConfig): Response {
  const headers = cacheHeadersFor(decision, config, res.headers.has('set-cookie'));

  Object.entries(headers).forEach(([name, value]) => res.headers.set(name, value));

  return res;
}

/** A route module's `cache` export, ignored unless it is a real policy. */
export function policyOf(module: unknown): CachePolicy | undefined {
  const policy = (module as { cache?: CachePolicy } | undefined)?.cache;

  return policy && typeof policy === 'object' && 'scope' in policy ? policy : undefined;
}
