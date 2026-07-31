import { createAdapterBuilder, GENERATED_DIR } from '@janux/cli/adapter/build';
import type { JanuxAppConfig } from '@janux/vite/config';

/**
 * The function, bundled here rather than on the platform.
 *
 * Vercel's runtimes *trace* a function's dependencies and ship the files they
 * find. In a workspace that fails before it runs: `node_modules/janux` is a
 * symlink to `packages/janux`, outside the project, and the packaging step
 * rejects it — "the framework produced an invalid deployment package for a
 * Serverless Function". Bundling first leaves nothing to trace: one file, no
 * bare specifiers, no symlinks, and no traced `node_modules` at all.
 *
 * Generating the app module and running the bundler are the same job for every
 * target, so both live on the shared `AdapterBuilder`. What is Vercel's alone is
 * the two lines of entry below.
 */

/** The bundle sits one level under the app root, like `api/`. */
export const BUNDLE_PATH = `${GENERATED_DIR}/server.js`;

/** Bundles the app into `.janux/server.js` and returns its size in bytes. */
export async function buildFunction(root: string, app: JanuxAppConfig): Promise<number> {
  const builder = createAdapterBuilder(root, app, 'janux-vercel');

  await builder.writeEntry({
    imports: ["import { createHandler } from '@janux/vercel';"],
    body: 'export default createHandler(app);',
  });

  return builder.bundle(BUNDLE_PATH, 'bun');
}
