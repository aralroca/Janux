import { posix } from 'node:path';
import { rebaseRelativeImports } from '../relative-imports';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';

/**
 * The Next file tree, laid out the way Janux reads it.
 *
 * The segment grammar is the part that carries over untouched — `[id]`,
 * `[...rest]`, `[[...rest]]` and `(group)` mean the same thing in both routers
 * — so the whole translation is the *file name* convention around it:
 * `page`/`layout`/`not-found` are a directory's role in Next, and a file's
 * prefix in Janux.
 *
 * The trap is colocation. `src/routes` turns every non-underscore file into a
 * route, so a `PostCard.tsx` left beside its page would become the URL
 * `/blog/PostCard`. Colocated files therefore move out to `src/components`,
 * and every relative import in the tree is rebased through the same plan.
 */

/** `app/…`, `pages/…`, with or without the `src/` Next also accepts. */
const ROUTER_ROOT = /^(?:src\/)?(app|pages)\//;

/** Next file conventions Janux answers somewhere other than the file system. */
const NEXT_ONLY: Record<string, string> = {
  loading: '`loading` has no file equivalent: a Janux boundary is `suspense:` on the `component()` that is waiting.',
  template: '`template` has no equivalent — a Janux `_layout` is not remounted per navigation; move the effect into the page.',
  default: '`default` belongs to parallel routes, which Janux does not have yet (query-string state covers modals).',
  sitemap: '`sitemap` is not a file convention: serve it from `src/api/sitemap.ts`.',
  robots: '`robots` is not a file convention: serve it from `src/api/robots.ts`, or set `robots` in a page `meta`.',
  manifest: '`manifest` is not a file convention: serve it from `src/api/manifest.ts`.',
  icon: 'Metadata images are not a file convention: put the asset in `public/` and link it from `meta.head`.',
  'apple-icon': 'Metadata images are not a file convention: put the asset in `public/` and link it from `meta.head`.',
  'opengraph-image': 'Metadata images are not a file convention: put the asset in `public/` and set `meta.image`.',
  'twitter-image': 'Metadata images are not a file convention: put the asset in `public/` and set `meta.image`.',
  _document: '`_document` has no equivalent: Janux owns the HTML shell, and `meta.head` is where a page adds to it.',
};

/** App Router page-role file name → the Janux file that plays that role. */
const APP_ROLE: Record<string, string> = {
  page: 'index',
  layout: '_layout',
  'not-found': '_404',
  error: '_500',
  'global-error': '_500',
};

interface Parts {
  router: string;
  dir: string;
  base: string;
  ext: string;
}

/** A path under a router root, split into the pieces every rule below reads. */
function parts(file: string): Parts | undefined {
  const match = ROUTER_ROOT.exec(file);

  if (!match) return undefined;
  const rest = file.slice(match[0].length);
  const ext = posix.extname(rest);
  const dir = posix.dirname(rest);

  return { router: match[1]!, dir: dir === '.' ? '' : dir, base: posix.basename(rest, ext), ext };
}

/**
 * The segments a handler answers under, for either router's spelling of the
 * tree: App Router puts the endpoint's name in the directory (`api/hello/route.ts`)
 * and Pages Router puts it in the file (`api/hello.ts`).
 */
function apiSegments(dir: string, base?: string): string[] {
  const segments = dir.split('/').filter(Boolean);
  const under = segments[0] === 'api' ? segments.slice(1) : segments;

  return base ? [...under, base] : under;
}

/** `src/api/<segments><ext>`, with no segments at all answering `/api` itself. */
function apiPath(segments: string[], ext: string): string {
  return posix.join('src/api', `${segments.join('/') || 'index'}${ext}`);
}

function appPath({ dir, base, ext }: Parts): string {
  if (base === 'route') return apiPath(apiSegments(dir), ext);
  const role = APP_ROLE[base];

  if (role) return posix.join('src/routes', dir, `${role}${ext}`);

  return posix.join('src/components', dir, `${base}${ext}`);
}

function pagesPath({ dir, base, ext }: Parts): string {
  if (isHandler('pages', dir, base)) return apiPath(apiSegments(dir, base), ext);
  if (base === '_app') return posix.join('src/routes', dir, `_layout${ext}`);
  if (base === '404' || base === '500') return posix.join('src/routes', dir, `_${base}${ext}`);

  return posix.join('src/routes', dir, `${base}${ext}`);
}

/** Whether this file is an HTTP handler in the router it belongs to. */
function isHandler(router: string, dir: string, base: string): boolean {
  if (router === 'app') return base === 'route';

  return dir === 'api' || dir.startsWith('api/');
}

/**
 * Where a file under a Next router root belongs, or `undefined` when it stays
 * — which is the answer both for files outside the tree and for the
 * conventions Janux deliberately has no file for.
 */
export function nextRoutePath(file: string): string | undefined {
  const split = parts(file);

  if (!split || NEXT_ONLY[split.base]) return undefined;

  return split.router === 'app' ? appPath(split) : pagesPath(split);
}

/** What this particular file still needs a human for. */
function notesFor({ router, dir, base }: Parts): string[] {
  const nextOnly = NEXT_ONLY[base];

  if (nextOnly) return [nextOnly];
  if (router === 'pages' && isHandler(router, dir, base)) {
    return ['A Pages Router handler takes `(req, res)`; a Janux handler is `({ req, params, ctx, url })` and returns a `Response`.'];
  }
  if (router === 'app' && base === 'route' && dir !== 'api' && !dir.startsWith('api/')) {
    return [`Janux mounts handlers under \`/api\`, so this endpoint answers \`/api/${dir}\` rather than \`/${dir}\`.`];
  }

  return [];
}

export const nextRoutes: Codemod = {
  id: 'next/routes',
  title: 'Next route structure',
  description: 'Moves `app/**` and `pages/**` into `src/routes` and `src/api`, and rebases the imports the move breaks.',
  appliesTo: (file: string) => ROUTER_ROOT.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    const split = parts(file);

    if (!split) return {};
    const to = nextRoutePath(file);
    const moved = to && SOURCE_FILE.test(file) ? rebaseRelativeImports(code, { from: file, to, mapPath }) : undefined;
    const notes = notesFor(split);

    return { ...(to ? { moveTo: to } : {}), ...(moved ? { code: moved } : {}), ...(notes.length > 0 ? { notes } : {}) };
  },
};

/** The move plan as seen by an import: a file that does not move maps to itself. */
function mapPath(path: string): string {
  return nextRoutePath(path) ?? path;
}
