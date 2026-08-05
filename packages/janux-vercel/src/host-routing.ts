import { parsePattern, type Segment } from '@janux/server';
import type { RedirectRule, RewriteRule } from 'janux';

/**
 * The app's declared `redirects`/`rewrites`, said in Vercel's vocabulary.
 *
 * Only a static export needs this: with a server in front, that server applies
 * the rules and this table would be a second implementation. What it must not
 * be is a second *pattern language* either — the sources are parsed by
 * `parsePattern`, the router's own, and only the output shape is Vercel's.
 *
 * @see https://vercel.com/docs/build-output-api/v3/configuration#source-route
 */

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Escaped for a regex: a route pattern's static segments are literals, dots included. */
function literal(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One segment as the regex fragment that matches it, leading slash included. */
function fragment(segment: Segment): string {
  if (segment.kind === 'static') return `/${literal(segment.raw)}`;
  // A typed matcher (`[id=integer]`) narrows a single segment here to any
  // single segment: the host cannot run the app's matcher, so it must not
  // claim to. The narrowing that remains is the shape of the URL.
  if (segment.kind === 'dynamic' || segment.kind === 'typed') return `/(?<${segment.name}>[^/]+)`;
  if (segment.kind === 'catchall') return `/(?<${segment.name}>.+)`;

  return `(?:/(?<${segment.name}>.*))?`;
}

/** `/blog/[slug]` → `^/blog/(?<slug>[^/]+)$`. */
export function sourcePattern(from: string): string {
  const body = parsePattern(from).map(fragment).join('');

  return `^${body || '/'}$`;
}

/** `/posts/[slug]` → `/posts/$slug`, the back-reference form Vercel substitutes. */
export function destination(to: string): string {
  // An off-site redirect keeps its origin: only the path is a pattern.
  if (ABSOLUTE.test(to)) {
    const url = new URL(to);

    url.pathname = destination(url.pathname);

    return url.href;
  }
  const body = parsePattern(to)
    .map((segment) => (segment.kind === 'static' ? segment.raw : `$${segment.name}`))
    .join('/');

  return `/${body}`;
}

/**
 * The routing table entries, in declaration order and before `filesystem` —
 * a legacy URL must not resolve to a file that happens to sit at that path.
 */
export function hostRoutes(redirects: RedirectRule[] = [], rewrites: RewriteRule[] = []): unknown[] {
  return [
    ...redirects.map((rule) => ({
      src: sourcePattern(rule.from),
      headers: { Location: destination(rule.to) },
      status: rule.status ?? 308,
    })),
    ...rewrites.map((rule) => ({ src: sourcePattern(rule.from), dest: destination(rule.to) })),
  ];
}
