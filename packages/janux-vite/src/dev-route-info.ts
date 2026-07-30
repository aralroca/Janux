import { relative } from 'node:path';
import { createFsRouter, type Matcher } from '@janux/server';

/**
 * The half of an error's Janux chain that only the server knows: which route
 * file answered the URL and which `_layout` chain wrapped it. The browser can
 * read the island, the intent, the guard and the origin off the runtime; it
 * cannot read the router.
 *
 * Served by the dev middleware only (see plugin.ts). A built app has no Vite
 * and therefore no such endpoint.
 */
export interface DevRouteInfo {
  path: string;
  /** The route pattern that matched, e.g. `/orders/[id]`. Absent when nothing matched. */
  pattern?: string;
  /** Route module, relative to the app root. */
  file?: string;
  /** `_layout` modules wrapping the route, outermost first, relative to the app root. */
  layouts: string[];
  params: Record<string, string>;
}

/** Where `janux dev` answers it. Not a route: the dev middleware owns this path. */
export const DEV_ROUTE_PATH = '/_janux/dev/route';

/** The endpoint itself: `undefined` for every URL that is not it, so the middleware passes those on. */
export function devRouteResponse(
  root: string,
  routesDir: string,
  url: string,
  matchers?: Record<string, Matcher>,
): Response | undefined {
  const asked = new URL(url, 'http://localhost');

  if (asked.pathname !== DEV_ROUTE_PATH) return undefined;

  return Response.json(devRouteInfo(root, routesDir, asked.searchParams.get('path') ?? '/', matchers));
}

/** Resolves one URL path against the app's file-system router. */
export function devRouteInfo(
  root: string,
  routesDir: string,
  path: string,
  matchers?: Record<string, Matcher>,
): DevRouteInfo {
  const match = createFsRouter(routesDir, matchers).match(path);

  if (!match) return { path, pattern: undefined, file: undefined, layouts: [], params: {} };

  return {
    path,
    pattern: match.pattern,
    file: relative(root, match.filePath),
    layouts: match.layouts.map((layout) => relative(root, layout)),
    params: match.params,
  };
}
