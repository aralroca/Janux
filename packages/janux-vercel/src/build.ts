import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JanuxAppConfig } from '@janux/vite/config';
import { generateApp } from './generate';

/**
 * The function, bundled here rather than on the platform.
 *
 * Vercel's runtimes *trace* a function's dependencies and ship the files they
 * find. In a workspace that fails before it runs: `node_modules/janux` is a
 * symlink to `packages/janux`, outside the project, and the packaging step
 * rejects it — "the framework produced an invalid deployment package for a
 * Serverless Function". Bundling first leaves nothing to trace: one file, no
 * bare specifiers, no symlinks, and no traced `node_modules` at all.
 */

const GENERATED_DIR = '.janux';
/**
 * `JANUX_APP_ROOT` is set before the app is imported, not after: a module that
 * locates its own data files (`join(import.meta.dirname, '../../content')` — the
 * docs site's markdown) does it at import time, and inside a bundle
 * `import.meta.dirname` is the bundle's directory, not the source file's. The
 * import is dynamic for that reason: static imports would be hoisted above the
 * assignment and read an empty root.
 */
const ENTRY = `import { join } from 'node:path';
import { createHandler } from '@janux/vercel';

process.env.JANUX_APP_ROOT = join(import.meta.dirname, '..');
const { default: app } = await import('./app');

export default createHandler(app);
`;
/** The bundle sits one level under the app root, like `api/` — see generate.ts. */
export const BUNDLE_PATH = `${GENERATED_DIR}/server.js`;

/**
 * The bundler runs as its own process, so it is found by name — and the name
 * depends on where this package is running from: source in the workspace,
 * compiled `dist/` once it is published.
 */
export function bundlerPath(exists: (path: string) => boolean = existsSync): string {
  const found = ['bundler.ts', 'bundler.js'].map((name) => join(import.meta.dirname, name)).find(exists);

  if (!found) throw new Error('janux-vercel: the bundler is missing next to this module');

  return found;
}

/** Bundles the app into `.janux/server.js` and returns its size in bytes. */
export async function buildFunction(root: string, app: JanuxAppConfig): Promise<number> {
  await Bun.write(join(root, GENERATED_DIR, 'app.ts'), generateApp(root, app));
  await Bun.write(join(root, GENERATED_DIR, 'entry.ts'), ENTRY);
  const built = Bun.spawnSync(['bun', bundlerPath(), `${GENERATED_DIR}/entry.ts`, BUNDLE_PATH], { cwd: root });

  if (!built.success) throw new Error(`janux-vercel: could not bundle the app\n${built.stderr.toString()}`);

  return Bun.file(join(root, BUNDLE_PATH)).size;
}
