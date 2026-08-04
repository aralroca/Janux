/**
 * The Node adapter: `bun run build && bunx janux-node` produces a `build/`
 * directory that `node build/index.js` serves, with no Bun on the machine.
 *
 * The build still runs under Bun — Vite, `@swc/core` and the bundler are build
 * tooling, and a deployment pipeline having Bun is a very different constraint
 * from every production box having it. What ships is one bundled file plus the
 * built client, and Node 24+ runs it.
 */
import { join } from 'node:path';
import {
  createRequestHandler,
  staticResponse,
  unsupportedFeatures,
  type AdapterCapabilities,
  type JanuxAdapter,
  type JanuxApp,
} from '@janux/cli/adapter';
import { createNodeServer, type NodeServer, type NodeServerOptions } from './server';

export { createNodeServer, type NodeServer, type NodeServerOptions };
export { toRequest, writeResponse } from './http-bridge';

/**
 * Where the deployment is written, relative to the app root.
 *
 * `build/` *is* the deployment root: copy that one directory to a box with Node
 * and it runs. That is why the bundle sits at `build/.janux/index.js` rather
 * than at `build/index.js` — the generated module resolves the app root as its
 * own parent directory, so a bundle one level down makes `build/` the root, and
 * `build/client` the assets beside it. `build/index.js` is the launcher you
 * actually run.
 */
export const BUILD_DIR = 'build';
const BUNDLE_PATH = `${BUILD_DIR}/.janux/index.js`;
const LAUNCHER = "import './.janux/index.js';\n";

/**
 * A long-lived process on a machine with a disk: Node can do everything Janux
 * asks of a runtime. WebSockets need the `ws` package, which this adapter
 * depends on — the same module `janux dev` already uses.
 */
export const capabilities: AdapterCapabilities = {
  websocket: true,
  streaming: true,
  filesystem: true,
  // A Node deployment is a persistent process, so schedules tick in-process.
  schedules: 'process',
};

/**
 * Boots a built app. This is what the generated `build/index.js` calls, and it
 * is exported so an app that wants its own server (metrics, extra middleware,
 * a second listener) can call it directly instead of forking the entry.
 */
export async function serve(app: JanuxApp, options: { port?: number; hostname?: string } = {}): Promise<NodeServer> {
  // `dist/client` inside the deployment, not `client`: the server decides
  // whether to emit the runtime script by looking for `dist/client/client.js`
  // under the app root, so a deployment that renames it serves pages that never
  // hydrate — silently, because the HTML is otherwise perfect.
  const clientDir = join(app.root, 'dist/client');
  const server = await createNodeServer({
    handler: createRequestHandler(app),
    staticResponse: (request) => staticResponse(clientDir, request),
    websocket: app.config.websocketModule ? (app.modules[app.config.websocketModule] as any)?.default : undefined,
    ...options,
  });

  console.log(`janux-node: serving on ${server.url} (node ${process.versions.node})`);

  return server;
}

/**
 * `build/` is self-contained on purpose: the bundle, the client assets it
 * serves, and a `package.json` marking it ESM. Copy that directory onto a box
 * with Node and it runs — no install, no `node_modules`, no source.
 */
export interface NodeAdapterOptions {
  /** Extra top-level directories the app reads at runtime — `content` for a docs site, `data` for a seeded DB. */
  include?: string[];
}

export function node({ include = [] }: NodeAdapterOptions = {}): JanuxAdapter {
  return {
    name: '@janux/node',
    capabilities,
    adapt: async (builder) => {
      unsupportedFeatures(builder.config, capabilities).forEach((gap) => builder.log(`unsupported — ${gap}`));

      await builder.writeEntry({
        imports: ["import { serve } from '@janux/node';"],
        body: 'await serve(app);',
      });
      const bytes = await builder.bundle(BUNDLE_PATH, 'node');

      builder.copyClient(`${BUILD_DIR}/dist/client`);
      // The bundle inlines every route *module*, but the router still reads the
      // routes directory to learn which URLs the app answers — so the source
      // tree travels with the deployment, as it does on every Janux target.
      ['src', ...include].forEach((dir) => {
        if (!builder.copyDir(dir, `${BUILD_DIR}/${dir}`) && dir !== 'src') builder.log(`--include ${dir}: no such directory, skipped`);
      });
      await builder.write(`${BUILD_DIR}/index.js`, LAUNCHER);
      // The bundle is ESM; without this Node reads the nearest package.json and
      // refuses it as CommonJS.
      await builder.write(`${BUILD_DIR}/package.json`, '{"type":"module"}\n');
      builder.log(`bundled the app (${Math.round(bytes / 1024)} KB) → ${BUILD_DIR}/`);
      builder.log(`run it with: node ${BUILD_DIR}/index.js`);
    },
  };
}
