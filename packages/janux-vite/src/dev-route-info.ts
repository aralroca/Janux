import { relative } from 'node:path';
import { createFsRouter, type Matcher } from '@janux/server';
import { toPosix } from './app-config';

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

/** The app config fields the endpoint needs — the same two the dev server routes with. */
interface DevRouteApp {
  routesDir: string;
  matchersModule?: string;
}

/**
 * The endpoint as the middleware uses it: resolves the app's own `src/matchers.ts`
 * first, exactly as `loadServerOptions` does. Without them a declared
 * `[post=slug]` route renders fine but reports here as unmatched, and a
 * diagnostic that lies about supported routing is worse than no diagnostic.
 */
export async function devRouteHandler(
  root: string,
  app: DevRouteApp,
  loadModule: (file: string) => Promise<Record<string, unknown>>,
  url: string,
): Promise<Response | undefined> {
  if (!url.startsWith(DEV_ROUTE_PATH)) return undefined;
  const matchers = app.matchersModule ? await loadModule(app.matchersModule) : undefined;

  return devRouteResponse(root, app.routesDir, url, matchers as Record<string, Matcher> | undefined);
}

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
    file: toPosix(relative(root, match.filePath)),
    layouts: match.layouts.map((layout) => toPosix(relative(root, layout))),
    params: match.params,
  };
}
