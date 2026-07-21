import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Route {
  pattern: string;
  segments: string[];
  filePath: string;
}

export interface RouteMatch {
  filePath: string;
  pattern: string;
  params: Record<string, string>;
}

const PAGE_EXTENSIONS = /\.(tsx|jsx|ts|js)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) return walk(full);

    return PAGE_EXTENSIONS.test(entry) && !entry.startsWith('_') ? [full] : [];
  });
}

function patternFor(dir: string, filePath: string): string {
  const raw = relative(dir, filePath).replace(PAGE_EXTENSIONS, '');
  const withoutIndex = raw === 'index' ? '' : raw.replace(/\/index$/, '');

  return `/${withoutIndex}`.replace(/\/+/g, '/');
}

function matchSegments(routeSegments: string[], pathSegments: string[]) {
  if (routeSegments.length !== pathSegments.length) return undefined;
  const params: Record<string, string> = {};
  const matched = routeSegments.every((segment, index) => {
    const value = pathSegments[index]!;
    const dynamic = /^\[(.+)\]$/.exec(segment);

    if (dynamic) {
      params[dynamic[1]!] = decodeURIComponent(value);

      return true;
    }

    return segment === value;
  });

  return matched ? params : undefined;
}

/** File-system router: `routes/index.tsx` → `/`, `routes/orders/[id].tsx` → `/orders/:id`. */
export function createFsRouter(dir: string) {
  const routes: Route[] = walk(dir)
    .map((filePath) => {
      const pattern = patternFor(dir, filePath);

      return { pattern, filePath, segments: pattern.split('/').filter(Boolean) };
    })
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  return {
    routes,
    match(pathname: string): RouteMatch | undefined {
      const pathSegments = pathname.split('/').filter(Boolean);
      const staticFirst = [...routes].sort(
        (a, b) => Number(a.pattern.includes('[')) - Number(b.pattern.includes('[')),
      );

      return staticFirst
        .map((route) => {
          const params = matchSegments(route.segments, pathSegments);

          return params ? { filePath: route.filePath, pattern: route.pattern, params } : undefined;
        })
        .find(Boolean);
    },
  };
}
