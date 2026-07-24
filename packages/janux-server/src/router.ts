import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Route {
  pattern: string;
  segments: Segment[];
  filePath: string;
  /** Layout module paths wrapping this route, outermost → innermost. */
  layouts: string[];
}

export interface RouteMatch {
  filePath: string;
  pattern: string;
  params: Record<string, string>;
  layouts: string[];
}

export type Matcher = (value: string) => boolean;

type SegmentKind = 'static' | 'typed' | 'dynamic' | 'catchall' | 'optional';

interface Segment {
  raw: string;
  kind: SegmentKind;
  name?: string;
  matcher?: string;
}

const PAGE_EXTENSIONS = /\.(tsx|jsx|ts|js)$/;
const GROUP_SEGMENT = /^\(.+\)$/;

/** Built-in typed param matchers; apps extend via `matchers` (ServerOptions). */
export const BUILTIN_MATCHERS: Record<string, Matcher> = {
  integer: (value) => /^\d+$/.test(value),
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
};

function parseSegment(raw: string): Segment {
  const optional = /^\[\[\.\.\.(.+)\]\]$/.exec(raw);

  if (optional) return { raw, kind: 'optional', name: optional[1] };
  const catchall = /^\[\.\.\.(.+)\]$/.exec(raw);

  if (catchall) return { raw, kind: 'catchall', name: catchall[1] };
  const dynamic = /^\[(.+)\]$/.exec(raw);

  if (!dynamic) return { raw, kind: 'static' };
  const [name, matcher] = dynamic[1]!.split('=');

  return matcher ? { raw, kind: 'typed', name, matcher } : { raw, kind: 'dynamic', name };
}

function layoutIn(dir: string): string | undefined {
  const candidates = ['_layout.tsx', '_layout.jsx', '_layout.ts', '_layout.js'];

  return candidates.map((name) => join(dir, name)).find(existsSync);
}

interface RawRoute {
  filePath: string;
  urlSegments: string[];
  layouts: string[];
}

/** Walks the routes tree tracking layouts; `(group)` dirs organize without touching the URL. */
function walk(dir: string, urlSegments: string[] = [], layouts: string[] = []): RawRoute[] {
  const ownLayout = layoutIn(dir);
  const chain = ownLayout ? [...layouts, ownLayout] : layouts;

  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      const nextSegments = GROUP_SEGMENT.test(entry) ? urlSegments : [...urlSegments, entry];

      return walk(full, nextSegments, chain);
    }
    if (!PAGE_EXTENSIONS.test(entry) || entry.startsWith('_')) return [];
    const base = entry.replace(PAGE_EXTENSIONS, '');
    const segments = base === 'index' ? urlSegments : [...urlSegments, base];

    return [{ filePath: full, urlSegments: segments, layouts: chain }];
  });
}

/** Specificity per segment: static > typed > dynamic > catch-all > optional catch-all. */
const KIND_SCORE: Record<SegmentKind, number> = {
  static: 4,
  typed: 3,
  dynamic: 2,
  catchall: 1,
  optional: 0,
};

/**
 * Deterministic route order (the route-sort spec): compare segment scores
 * left-to-right; a route that ends before the other wins against a rest
 * segment (exact depth beats swallowing); ties break on pattern text.
 */
function compareRoutes(a: Route, b: Route): number {
  const length = Math.max(a.segments.length, b.segments.length);

  for (let index = 0; index < length; index += 1) {
    const left = a.segments[index];
    const right = b.segments[index];

    if (!left && !right) break;
    if (!left) return -1;
    if (!right) return 1;
    const diff = KIND_SCORE[right.kind] - KIND_SCORE[left.kind];

    if (diff !== 0) return diff;
  }

  return a.pattern.localeCompare(b.pattern);
}

function matchRoute(
  route: Route,
  pathSegments: string[],
  matchers: Record<string, Matcher>,
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  const { segments } = route;
  const last = segments[segments.length - 1];
  const isRest = last?.kind === 'catchall' || last?.kind === 'optional';
  const fixed = isRest ? segments.length - 1 : segments.length;
  const minLength = last?.kind === 'catchall' ? fixed + 1 : fixed;

  if (isRest ? pathSegments.length < minLength : pathSegments.length !== fixed) return undefined;
  for (let index = 0; index < fixed; index += 1) {
    const segment = segments[index]!;
    const value = decodeURIComponent(pathSegments[index]!);

    if (segment.kind === 'static') {
      if (segment.raw !== pathSegments[index]) return undefined;
      continue;
    }
    if (segment.kind === 'typed' && !matchers[segment.matcher!]?.(value)) return undefined;
    params[segment.name!] = value;
  }
  if (isRest) params[last!.name!] = pathSegments.slice(fixed).map(decodeURIComponent).join('/');

  return params;
}

/**
 * File-system router: full segment grammar (`[param]`, `[param=matcher]`,
 * `[...rest]`, `[[...rest]]`), `(group)` directories and nested `_layout.*`
 * chains, matched in deterministic specificity order.
 */
export function createFsRouter(dir: string, customMatchers: Record<string, Matcher> = {}) {
  const matchers = { ...BUILTIN_MATCHERS, ...customMatchers };
  const routes: Route[] = walk(dir)
    .map(({ filePath, urlSegments, layouts }) => ({
      pattern: `/${urlSegments.join('/')}`.replace(/\/+/g, '/'),
      segments: urlSegments.map(parseSegment),
      filePath,
      layouts,
    }))
    .sort(compareRoutes);

  return {
    routes,
    match(pathname: string): RouteMatch | undefined {
      const pathSegments = pathname.split('/').filter(Boolean);

      return routes
        .map((route) => {
          const params = matchRoute(route, pathSegments, matchers);

          return params
            ? { filePath: route.filePath, pattern: route.pattern, params, layouts: route.layouts }
            : undefined;
        })
        .find(Boolean);
    },
  };
}
