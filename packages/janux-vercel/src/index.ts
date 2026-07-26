import { prodServerOptions, type PrebuiltApp } from '@janux/cli/prod';
import { createJanuxServer } from '@janux/server';

export interface VercelApp extends PrebuiltApp {
  /** The app root, as the *running* function sees it — `/var/task/...`, not the build machine's. */
  root: string;
}

/**
 * Vercel's Bun runtime takes a function that default-exports `{ fetch }` — the
 * same shape `Bun.serve` takes, which is the shape a Janux server already is.
 * Static assets never reach here: Vercel's CDN answers them from the build's
 * output directory before the function is invoked.
 *
 * `app` is the module `janux-vercel` generates: the app's own modules, imported
 * statically so the bundler inlines them. Without it the handler resolves the
 * app from disk the way `janux start` does — which is what a local run wants,
 * and what a bundled function cannot do.
 */
export function createHandler(app?: VercelApp): { fetch(request: Request): Promise<Response> } {
  let booted: Promise<{ fetch(request: Request): Promise<Response> }> | undefined;

  return {
    fetch(request) {
      booted ??= boot(app);

      return booted.then((server) => server.fetch(request));
    },
  };
}

/** Once per instance, not once per request — a cold start pays for the whole app. */
async function boot(app: VercelApp | undefined): Promise<{ fetch(request: Request): Promise<Response> }> {
  return createJanuxServer(await prodServerOptions(app?.root ?? process.cwd(), app));
}

export interface VercelConfigOptions {
  /** The app's `output`: a server app gets a Bun function, a static one gets HTML. */
  output?: 'bun' | 'static';
  buildCommand?: string;
  /** Extra top-level directories the function reads at runtime (app data, content). */
  include?: string[];
  maxDuration?: number;
}

const SCHEMA = 'https://openapi.vercel.sh/vercel.json';
/** Where a server app's function lives. Vercel takes `api/**` as its functions. */
export const FUNCTION_PATH = 'api/index.ts';
/** `src` carries the routes the server resolves; `dist` the built client and stylesheet. */
const RUNTIME_DIRS = ['src', 'dist'];

function includeGlob(include: string[]): string {
  const dirs = [...new Set([...RUNTIME_DIRS, ...include])];

  return dirs.length === 1 ? `${dirs[0]}/**` : `{${dirs.join(',')}}/**`;
}

/**
 * The `vercel.json` a Janux app deploys with. It is generated rather than
 * documented as a snippet because Vercel reads it *before* the build — an app
 * cannot write it from its own build step, so `janux-vercel` writes it once.
 */
export function vercelConfig({
  output = 'bun',
  buildCommand = 'bunx janux-vercel && bun run build',
  include = [],
  maxDuration,
}: VercelConfigOptions = {}): Record<string, unknown> {
  const base = { $schema: SCHEMA, buildCommand, outputDirectory: 'dist/client' };

  // A static export is plain HTML: no function, no runtime, nothing to route.
  if (output === 'static') return { ...base, cleanUrls: true };

  return {
    ...base,
    // The whole deployment runs on Bun — the runtime Janux itself targets.
    bunVersion: '1.x',
    functions: { [FUNCTION_PATH]: { includeFiles: includeGlob(include), ...(maxDuration ? { maxDuration } : {}) } },
    // Anything the CDN did not answer from `outputDirectory` is the app's.
    rewrites: [{ source: '/(.*)', destination: `/${FUNCTION_PATH.replace(/\.ts$/, '')}` }],
  };
}

