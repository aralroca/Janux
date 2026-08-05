import type { RedirectRule, RewriteRule } from 'janux';
import { matchRoute } from './match-segments';
import { BUILTIN_MATCHERS, parsePattern, type Matcher, type Segment } from './router';

/**
 * `redirects` and `rewrites` from janux.config.ts, compiled once at boot and
 * applied at the one point every URL passes through (see `server.ts`).
 *
 * They are matched with the file router's own grammar — `parsePattern` +
 * `matchRoute`, the same two functions the route tree uses — so there is one
 * pattern language in the framework and one place where its edge cases live.
 * Declaring none is the common case: `createRoutingRules` answers `undefined`
 * and the request never calls into here at all.
 */

/** Permanent, and the one redirect status that may not turn a POST into a GET. */
const DEFAULT_STATUS = 308;
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
/** Long enough for any real chain, short enough that a cycle is an error and not a hang. */
const MAX_REWRITE_HOPS = 8;
const INTERNAL_PREFIX = '/_janux';
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i;

interface CompiledRule {
  segments: Segment[];
  to: string;
  status: number;
}

export interface RoutingRulesConfig {
  redirects?: RedirectRule[];
  rewrites?: RewriteRule[];
  /** The app's typed param matchers — the same map the router is given. */
  matchers?: Record<string, Matcher>;
}

export interface RoutingRules {
  /** The 3xx a declared redirect answers with, or `undefined` when none matches. */
  redirect(url: URL): Response | undefined;
  /** The path a declared rewrite serves instead, or `undefined` when none matches. */
  rewrite(pathname: string): string | undefined;
}

/** The framework's own surface, which no declared rule may address. */
function isInternal(pathname: string): boolean {
  return pathname === INTERNAL_PREFIX || pathname.startsWith(`${INTERNAL_PREFIX}/`);
}

/**
 * Config mistakes surface at boot with the rule that caused them, because the
 * alternative is a redirect loop or a `RangeError` discovered by a visitor.
 */
function compile(rule: RedirectRule | RewriteRule, status: number, isRewrite: boolean): CompiledRule {
  const what = `janux: ${isRewrite ? 'rewrite' : 'redirect'} "${rule.from}" → "${rule.to}"`;

  if (!rule.from.startsWith('/')) throw new Error(`${what} — the source pattern must start with a slash.`);
  // A redirect onto its own source is a loop the browser runs, not the server:
  // no hop limit can catch it, so it is refused where it is written.
  if (!isRewrite && rule.from === rule.to) throw new Error(`${what} — a redirect to its own source is an endless loop in the browser.`);
  if (isRewrite && !rule.to.startsWith('/')) throw new Error(`${what} — the destination must start with a slash: a rewrite serves a route of this app. Redirect to reach another origin, or proxy one in src/middleware.ts.`);
  if (isRewrite && isInternal(rule.to)) throw new Error(`${what} — the destination may not address ${INTERNAL_PREFIX}/*, where the invocation pipeline enforces guards.`);
  if (!REDIRECT_STATUSES.has(status)) throw new Error(`${what} — the status must be 301, 302, 307 or 308 (got ${status}).`);

  return { segments: parsePattern(rule.from), to: rule.to, status };
}

/** The first rule whose pattern matches, with what it captured. Declaration order is the contract. */
function firstHit(
  rules: CompiledRule[],
  pathname: string,
  matchers: Record<string, Matcher>,
): { rule: CompiledRule; params: Record<string, string> } | undefined {
  const pathSegments = pathname.split('/').filter(Boolean);

  return rules
    .map((rule) => {
      const params = matchRoute(rule, pathSegments, matchers);

      return params ? { rule, params } : undefined;
    })
    .find(Boolean);
}

/** One destination segment, read with the grammar it was written in. */
function fillSegment(segment: Segment, params: Record<string, string>): string {
  if (segment.kind === 'static') return segment.raw;
  const value = params[segment.name!] ?? '';
  // A rest value is already a path: encode its parts, not its separators.
  const parts = segment.kind === 'catchall' || segment.kind === 'optional' ? value.split('/') : [value];

  return parts.filter(Boolean).map(encodeURIComponent).join('/');
}

/** `/posts/[slug]` + `{ slug: 'hello' }` → `/posts/hello`. */
function fillPath(path: string, params: Record<string, string>): string {
  return `/${parsePattern(path).map((segment) => fillSegment(segment, params)).filter(Boolean).join('/')}`;
}

/** The destination, with an absolute URL's origin left alone and its own query kept. */
function fill(to: string, params: Record<string, string>): string {
  if (ABSOLUTE.test(to)) {
    const url = new URL(to);

    url.pathname = fillPath(url.pathname, params);

    return url.href;
  }
  const query = to.indexOf('?');

  return query === -1 ? fillPath(to, params) : `${fillPath(to.slice(0, query), params)}${to.slice(query)}`;
}

/** The path the first matching rule resolves to, or `undefined` when none matches. */
function resolveOnce(rules: CompiledRule[], pathname: string, matchers: Record<string, Matcher>): string | undefined {
  const hit = firstHit(rules, pathname, matchers);

  return hit && fill(hit.rule.to, hit.params);
}

/**
 * Where a chain of rewrites settles, or `undefined` when nothing applied.
 *
 * A rewrite that resolves into `/_janux/*` is refused rather than thrown: what
 * it resolved from came off the wire, so a hostile URL must not be able to turn
 * a rule into a 500. The chain stops there and the request goes on unrewritten.
 */
function settle(rules: CompiledRule[], from: string, matchers: Record<string, Matcher>): string | undefined {
  const chain = [from];
  let next = resolveOnce(rules, from, matchers);

  while (next !== undefined && !isInternal(next)) {
    chain.push(next);
    // `chain` holds the source plus one entry per rewrite applied, so the hop
    // count is one less than its length.
    if (chain.length - 1 > MAX_REWRITE_HOPS) {
      throw new Error(`janux: rewrite chain did not settle after ${MAX_REWRITE_HOPS} hops (${chain.join(' → ')}) — janux.config.ts has a rewrite cycle.`);
    }
    next = resolveOnce(rules, next, matchers);
  }

  return chain.length > 1 ? chain[chain.length - 1] : undefined;
}

/**
 * The compiled rules, or `undefined` when the app declared none — which is what
 * makes this cost a null check per request rather than a match.
 */
export function createRoutingRules(config: RoutingRulesConfig): RoutingRules | undefined {
  const redirects = (config.redirects ?? []).map((rule) => compile(rule, rule.status ?? DEFAULT_STATUS, false));
  const rewrites = (config.rewrites ?? []).map((rule) => compile(rule, DEFAULT_STATUS, true));
  // Built-ins included, exactly as `createFsRouter` composes them: `[id=integer]`
  // has to mean the same thing in a redirect as it does in a route file.
  const matchers = { ...BUILTIN_MATCHERS, ...config.matchers };

  if (redirects.length + rewrites.length === 0) return undefined;

  return {
    // `/_janux/*` is excluded on the way in too: a greedy `[...all]` rule is a
    // migration map, not a decision to take the agent surface off the air.
    redirect(url) {
      const hit = isInternal(url.pathname) ? undefined : firstHit(redirects, url.pathname, matchers);

      if (!hit) return undefined;
      const location = fill(hit.rule.to, hit.params);

      return new Response(null, {
        status: hit.rule.status,
        // The query the visitor arrived with survives, unless the rule asked its own.
        headers: { location: url.search && !location.includes('?') ? `${location}${url.search}` : location },
      });
    },
    rewrite(pathname) {
      return isInternal(pathname) ? undefined : settle(rewrites, pathname, matchers);
    },
  };
}
