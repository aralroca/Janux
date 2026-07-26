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

/**
 * The `vercel.json` a Janux app commits. Short, because the deployment itself is
 * described by the Build Output API directory the build writes (see output.ts):
 * the config only has to say how to produce it, and on which runtime.
 *
 * It is generated rather than documented as a snippet because Vercel reads it
 * *before* the build — no build step could have produced it.
 */
export function vercelConfig({
  output = 'bun',
  buildCommand = 'bun run build && bunx janux-vercel',
  include = [],
  maxDuration,
}: VercelConfigOptions = {}): Record<string, unknown> {
  const flags = [...include.flatMap((dir) => ['--include', dir]), ...(maxDuration ? ['--max-duration', String(maxDuration)] : [])];
  const base = { $schema: SCHEMA, buildCommand: [buildCommand, ...flags].join(' ') };

  // A static export has no runtime to choose: prerendered HTML on the CDN.
  if (output === 'static') return { ...base, cleanUrls: true };

  // The whole deployment runs on Bun — the runtime Janux itself targets.
  return { ...base, bunVersion: '1.x' };
}

