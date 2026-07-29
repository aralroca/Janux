/**
 * A page that matched a route but has nothing to show — `/posts/does-not-exist`
 * — is a 404, not a page that renders "not found" with a 200. The route knows
 * it, so the route says it, and the server answers with the app's `_404` page.
 */

const NOT_FOUND = Symbol.for('janux.notFound');

/**
 * Answers the request with the app's `_404` page (status 404):
 * `const post = bySlug(params.slug); if (!post) notFound();`
 *
 * It throws, so nothing after it runs — TypeScript narrows the code below the
 * call. Only the page's own render can still change the status line, so call it
 * from the route module (or something it awaits), not from a component the
 * stream reaches later.
 */
export function notFound(): never {
  throw Object.assign(new Error('janux: notFound()'), { [NOT_FOUND]: true });
}

/** Whether an error is the `notFound()` signal — for a custom server wrapping `server.fetch`. */
export function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<symbol, unknown>)[NOT_FOUND]);
}
