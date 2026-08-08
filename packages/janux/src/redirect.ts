/**
 * `notFound()`'s sibling: a route that knows its content lives elsewhere —
 * `/music/[conversion]` with a retired slug, say — answers with a Location
 * header, not by rendering something else under the old URL.
 */

const REDIRECT = Symbol.for('janux.redirect');

export type RedirectStatus = 301 | 302 | 307 | 308;

interface RedirectSignal {
  location: string;
  status: RedirectStatus;
}

/**
 * Answers the request with a redirect: `if (!valid(params.slug)) redirect('/docs');`
 *
 * Default `307`: temporary, and the method survives. It throws, so nothing
 * after it runs. Like `notFound()`, call it from the route module (or
 * something it awaits) — once the response streams, the status line is gone.
 */
export function redirect(location: string, status: RedirectStatus = 307): never {
  throw Object.assign(new Error(`janux: redirect(${location})`), { [REDIRECT]: { location, status } });
}

/** The redirect an error carries, when it is the `redirect()` signal — for hosts wrapping the render. */
export function redirectTarget(error: unknown): RedirectSignal | undefined {
  return error && typeof error === 'object'
    ? ((error as Record<symbol, unknown>)[REDIRECT] as RedirectSignal | undefined)
    : undefined;
}
