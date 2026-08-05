import {
  createRequestHandler,
  type AdapterCapabilities,
  type JanuxAdapter,
  type JanuxApp,
  type JanuxRequestHandler,
} from '@janux/cli/adapter';
import type { OutputOptions } from './output';

/** The app root a running function sees is `/var/task/...`, not the build machine's — hence `root`. */
export type VercelApp = JanuxApp;

/**
 * A Vercel function is a serverless invocation: it can stream a response and it
 * can write to `/tmp`, but it does not outlive the request, so there is nothing
 * to hold a WebSocket open. An app with `src/ws.ts` is told at build time
 * rather than in production.
 */
export const capabilities: AdapterCapabilities = {
  websocket: false,
  streaming: true,
  filesystem: true,
  // No persistent process on a function: Vercel Cron POSTs /_janux/schedules/tick
  // (crons in vercel.json, JANUX_CRON_SECRET as the bearer).
  schedules: 'http',
  // Redirects for a static export become Build Output API routes — see output.ts.
  redirects: true,
};

/**
 * Vercel's Bun runtime takes a function that default-exports `{ fetch }` — the
 * same shape `Bun.serve` takes, which is the shape a Janux server already is,
 * and the shape every Janux adapter produces. Static assets never reach here:
 * Vercel's CDN answers them from the build's output directory before the
 * function is invoked.
 *
 * `app` is the module `janux-vercel` generates: the app's own modules, imported
 * statically so the bundler inlines them. Without it the handler resolves the
 * app from disk the way `janux start` does — which is what a local run wants,
 * and what a bundled function cannot do.
 */
export function createHandler(app?: VercelApp): JanuxRequestHandler {
  return createRequestHandler(app);
}

/**
 * The adapter face. `janux-vercel` also writes `vercel.json`, which no build
 * hook could do — Vercel reads it *before* the build — so the CLI does that
 * first and then runs this.
 */
export function vercel(options: OutputOptions = {}): JanuxAdapter {
  return {
    name: 'janux-vercel',
    capabilities,
    adapt: async (builder) => {
      const { writeVercelOutput } = await import('./output');

      await writeVercelOutput(builder.root, builder.config, options);
    },
  };
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

