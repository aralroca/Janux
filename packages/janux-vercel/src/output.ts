import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { JanuxAppConfig } from '@janux/vite/config';
import { BUNDLE_PATH, buildFunction } from './build';

/**
 * The deployment, written as a Build Output API directory.
 *
 * The alternative — letting the platform build `api/**` — means letting it
 * *trace* what the function needs, and a traced function cannot leave a
 * workspace: `node_modules/janux` is a symlink to `packages/janux`, outside the
 * project, and packaging one is fatal. Writing the output ourselves means
 * nothing is traced and nothing is guessed: these bytes, that config.
 *
 * @see https://vercel.com/docs/build-output-api
 */

const OUTPUT_DIR = '.vercel/output';
const FUNCTION_DIR = `${OUTPUT_DIR}/functions/index.func`;
const STATIC_DIR = `${OUTPUT_DIR}/static`;
/**
 * The launcher may hand the module a `Request` or look for `{ fetch }`
 * depending on which runtime picks it up, so the export answers to both.
 */
const HANDLER = `import server from './${BUNDLE_PATH}';

const handler = (request) => server.fetch(request);

handler.fetch = handler;

export default handler;
`;
/**
 * Node's runtime identifier, with `bunVersion` in vercel.json deciding which
 * binary actually runs it — Bun's runtime is a deployment-wide setting on
 * Vercel, not a per-function one.
 */
const RUNTIME = 'nodejs22.x';

export interface OutputOptions {
  /** Extra top-level directories the app reads at runtime (`content` for a docs site). */
  include?: string[];
  maxDuration?: number;
}

/** Config the app reads from disk at runtime, so it travels with the function. */
async function copyRuntimeFiles(root: string, target: string, include: string[]): Promise<void> {
  const dirs = ['src', 'dist', ...include];

  for (const dir of dirs) {
    if (existsSync(join(root, dir))) await cp(join(root, dir), join(target, dir), { recursive: true });
  }
}

async function writeFunction(root: string, app: JanuxAppConfig, { include = [], maxDuration }: OutputOptions): Promise<number> {
  const target = join(root, FUNCTION_DIR);
  const bytes = await buildFunction(root, app);

  await mkdir(join(target, '.janux'), { recursive: true });
  await cp(join(root, BUNDLE_PATH), join(target, BUNDLE_PATH));
  await Bun.write(join(target, 'index.js'), HANDLER);
  await Bun.write(join(target, 'package.json'), '{"type":"module"}\n');
  await Bun.write(
    join(target, '.vc-config.json'),
    `${JSON.stringify({ runtime: RUNTIME, handler: 'index.js', launcherType: 'Nodejs', supportsResponseStreaming: true, ...(maxDuration ? { maxDuration } : {}) }, null, 2)}\n`,
  );
  await copyRuntimeFiles(root, target, include);

  return bytes;
}

/** Static assets first (the CDN answers those), then the app. */
function routes(server: boolean): unknown[] {
  if (!server) return [{ handle: 'filesystem' }];

  return [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }];
}

/**
 * Writes `.vercel/output`. Vercel picks it up after the build command and skips
 * its own build entirely — which is the point.
 */
export async function writeVercelOutput(root: string, app: JanuxAppConfig, options: OutputOptions = {}): Promise<number> {
  const server = app.output !== 'static';

  await rm(join(root, OUTPUT_DIR), { recursive: true, force: true });
  await mkdir(join(root, STATIC_DIR), { recursive: true });
  if (existsSync(join(root, 'dist/client'))) {
    await cp(join(root, 'dist/client'), join(root, STATIC_DIR), { recursive: true });
  }
  await Bun.write(join(root, OUTPUT_DIR, 'config.json'), `${JSON.stringify({ version: 3, routes: routes(server) }, null, 2)}\n`);

  return server ? writeFunction(root, app, options) : 0;
}
