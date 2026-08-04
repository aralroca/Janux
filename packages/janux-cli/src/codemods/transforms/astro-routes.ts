import { posix } from 'node:path';
import { rebaseRelativeImports } from '../relative-imports';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';

/**
 * `src/pages` laid out the way Janux reads it — and honest about how little of
 * an Astro app that is.
 *
 * The segment grammar carries over (`[slug]`, `[...path]`), and an Astro
 * endpoint is already a function returning a `Response`, so `.ts` pages move
 * cleanly into `src/api`. `.astro` files do not move at all: they are a
 * different template language, and a codemod that dropped one into
 * `src/routes` would produce an app that looks migrated and does not build.
 * What it does instead is name the file each template becomes, so the rewrite
 * has a destination.
 */

const PAGES_ROOT = /^src\/pages\//;
/** Astro serves markdown as a page; Janux serves it as a collection entry. */
const MARKDOWN = /\.mdx?$/;
const TEMPLATE = /\.astro$/;

/** `src/pages/api/users/[id].ts` → `users/[id]`, `src/pages/rss.xml.ts` → `rss.xml`. */
function endpointPath(rest: string, ext: string): string {
  const under = rest.slice(0, -ext.length).replace(/^api\//, '');

  return posix.join('src/api', `${under}${ext}`);
}

/** The route file the template should be rewritten into: `index.astro` → `src/routes/index.tsx`. */
export function templateTarget(file: string): string | undefined {
  if (!PAGES_ROOT.test(file) || !TEMPLATE.test(file)) return undefined;
  const rest = file.slice('src/pages/'.length).replace(TEMPLATE, '');
  const dir = posix.dirname(rest);
  const base = posix.basename(rest);
  const named = base === '404' || base === '500' ? `_${base}` : base;

  return posix.join('src/routes', dir === '.' ? '' : dir, `${named}.tsx`);
}

/**
 * Where an `src/pages` file belongs, or `undefined` when it stays — which is
 * every template and every markdown page, because neither is a file Janux can
 * run where Astro put it.
 */
export function astroRoutePath(file: string): string | undefined {
  if (!PAGES_ROOT.test(file)) return undefined;
  const rest = file.slice('src/pages/'.length);
  const ext = posix.extname(rest);

  return SOURCE_FILE.test(rest) ? endpointPath(rest, ext) : undefined;
}

function notesFor(file: string): string[] {
  const template = templateTarget(file);

  if (template) return [`\`.astro\` is a template language Janux does not run — rewrite this page as \`${template}\`.`];
  if (MARKDOWN.test(file)) {
    return ['Markdown under `src/pages` was a page in Astro; in Janux it is a collection entry — move it under a `defineCollection()` directory and render it from a route.'];
  }
  const rest = file.slice('src/pages/'.length);

  if (!rest.startsWith('api/')) return [`Janux mounts handlers under \`/api\`, so this endpoint answers \`/api/${rest.replace(SOURCE_FILE, '')}\`.`];

  return [];
}

export const astroRoutes: Codemod = {
  id: 'astro/routes',
  title: 'Astro route structure',
  description: 'Moves `src/pages` endpoints into `src/api`, and names the route file each `.astro` page becomes.',
  appliesTo: (file: string) => PAGES_ROOT.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    if (!PAGES_ROOT.test(file)) return {};
    const to = astroRoutePath(file);
    const moved = to ? rebaseRelativeImports(code, { from: file, to, mapPath }) : undefined;
    const notes = notesFor(file);

    return { ...(to ? { moveTo: to } : {}), ...(moved ? { code: moved } : {}), ...(notes.length > 0 ? { notes } : {}) };
  },
};

/** The move plan as seen by an import: a file that does not move maps to itself. */
function mapPath(path: string): string {
  return astroRoutePath(path) ?? path;
}
