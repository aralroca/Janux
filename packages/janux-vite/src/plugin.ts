import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { createJanuxServer, type ServerOptions } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { packageDir, runtimeIncludes } from './deps';
import { mimeFor, resolvePublicFile } from './static-files';
import { apiFiles, resolveAppConfig, shellOptions, type JanuxPluginOptions } from './app-config';
import { apiModuleName, apiStubModule } from './api-stubs';
import { sendFetchResponse, toFetchRequest } from './request-adapter';

const SSR_PACKAGES = ['janux', '@janux/server', '@janux/agent'];

async function loadServerOptions(vite: ViteDevServer, options: JanuxPluginOptions): Promise<ServerOptions> {
  const app = await resolveAppConfig(vite.config.root, options);
  const apiModules = Object.fromEntries(
    await Promise.all(
      apiFiles(app.serverDir).map(async (file) => [
        apiModuleName(file),
        (await vite.ssrLoadModule(file)) as Record<string, unknown>,
      ]),
    ),
  );
  const agentModule = app.agentModule ? await vite.ssrLoadModule(app.agentModule) : undefined;
  const storesModule = app.storesModule ? await vite.ssrLoadModule(app.storesModule) : undefined;
  const i18nModule = app.i18nModule ? await vite.ssrLoadModule(app.i18nModule) : undefined;
  const middlewareModule = app.middlewareModule ? await vite.ssrLoadModule(app.middlewareModule) : undefined;
  const ctxModule = app.ctxModule ? await vite.ssrLoadModule(app.ctxModule) : undefined;
  const matchersModule = app.matchersModule ? await vite.ssrLoadModule(app.matchersModule) : undefined;

  return {
    routesDir: app.routesDir,
    loadRoute: (filePath) => vite.ssrLoadModule(filePath),
    apis: apiModules,
    agent: (agentModule?.default as ServerOptions['agent']) ?? defineAgent(),
    storeDefs: (storesModule ?? {}) as ServerOptions['storeDefs'],
    runtimeUrl: app.clientEntry ? `/${relativeToRoot(vite.config.root, app.clientEntry)}` : undefined,
    ...shellOptions(app, devStylesheets(vite.config.root, app.stylesheet)),
    llmsTxt: app.llmsTxt,
    i18n: i18nModule?.default as ServerOptions['i18n'],
    foreignImport: appForeignImport(vite.config.root),
    middleware: middlewareModule?.default as ServerOptions['middleware'],
    ctxFor: ctxModule?.default as ServerOptions['ctxFor'],
    matchers: matchersModule as ServerOptions['matchers'],
    httpHandlers: app.httpHandlersDir
      ? { dir: app.httpHandlersDir, loadModule: (file) => vite.ssrLoadModule(file) as any }
      : undefined,
  };
}

/** Resolves react/react-dom from the APP root, so SSR uses the same copy the app's components do. */
function appForeignImport(root: string): ServerOptions['foreignImport'] {
  const appRequire = createRequire(join(root, 'package.json'));

  return (spec) => import(pathToFileURL(appRequire.resolve(spec)).href);
}

function relativeToRoot(root: string, absolute: string): string {
  return absolute.startsWith(root) ? absolute.slice(root.length + 1) : absolute;
}

/**
 * Dev stylesheet URLs for the HTML shell. `?direct` is Vite's contract for the
 * compiled stylesheet itself: without it the same path is served as a JS
 * module (`text/javascript`, how CSS HMR works), and a
 * <link rel="stylesheet"> pointing at that is a MIME mismatch the browser may
 * refuse — and, with no charset on the response, may decode as Latin-1,
 * turning non-ASCII `content:` glyphs into mojibake.
 */
export function devStylesheets(root: string, stylesheet: string | undefined): string[] {
  if (!stylesheet) return [];
  const url = `/${relativeToRoot(root, stylesheet)}`;

  return [`${url}${url.includes('?') ? '&' : '?'}direct`];
}

/**
 * `foreign()` reaches React through a dynamic import, but Rollup resolves those
 * statically: an app that never uses foreign islands (and so never installs
 * react) used to fail `janux build` on an import it can never execute. When the
 * app root can't resolve them, they stay external — the expression survives in
 * dead code instead of breaking the bundle.
 */
export function foreignExternals(root: string): string[] {
  const missing = FOREIGN_PACKAGES.filter((name) => !packageDir(name, root));

  return missing.length > 0 ? FOREIGN_PACKAGES : [];
}

const FOREIGN_PACKAGES = ['react', 'react-dom', 'react-dom/client'];

/** The Janux Vite plugin: JSX runtime config, api() client stubs (SWC) and the SSR dev bridge. */
export function janux(options: JanuxPluginOptions = {}): Plugin {
  /** Where the app keeps its `*.api.ts` modules, learned in `config`. */
  let serverDir = '';

  return {
    name: 'janux',

    async config(config) {
      const root = resolve(config.root ?? process.cwd());
      const app = await resolveAppConfig(root, options);
      const { clientEntry } = app;

      serverDir = `${app.serverDir}/`;

      return {
        appType: 'custom',
        build: { rollupOptions: { external: foreignExternals(root) } },
        esbuild: { jsx: 'automatic', jsxImportSource: 'janux' },
        // react/react-dom deduped so every browser-side import is one copy;
        // SSR resolves them via `foreignImport` from the app root instead
        // (externals bypass dedupe and two Reacts break hooks).
        resolve: { dedupe: ['janux', 'react', 'react-dom'] },
        ssr: { noExternal: SSR_PACKAGES },
        optimizeDeps: {
          exclude: SSR_PACKAGES,
          include: runtimeIncludes(root),
          // Vite finds what to pre-bundle by crawling HTML files, and a Janux app
          // has none — the shell is rendered by the server. With nothing to crawl
          // it pre-bundles nothing at startup and meets the app's own deps
          // mid-session instead, re-optimizing and 504ing whatever import is in
          // flight. The client entry is the browser graph's real root.
          entries: clientEntry ? [relativeToRoot(root, clientEntry)] : undefined,
        },
      };
    },

    /*
     * An api module is one the *app* declared, which means one inside its server
     * directory. Matching on the filename alone claimed files that were never
     * ours: `monaco-editor/esm/vs/editor/editor.api.js` was projected into fetch
     * stubs in every production build, so `monaco.languages` became an async
     * function and the docs playground died on arrival with
     * `languages.register is not a function`.
     */
    transform(code, id, transformOptions) {
      if (!id.startsWith(serverDir) || !/\.api\.[tj]s($|\?)/.test(id)) return undefined;
      if (transformOptions?.ssr) return undefined;

      return { code: apiStubModule(id, code), map: null };
    },

    configureServer(vite) {
      let cached: Promise<ReturnType<typeof createJanuxServer>> | undefined;

      const januxServer = () => {
        cached ??= loadServerOptions(vite, options).then(createJanuxServer);

        return cached;
      };

      vite.watcher.on('change', () => {
        cached = undefined;
      });

      return () => {
        vite.middlewares.use((req, res, next) => {
          const handle = async () => {
            const publicFile = resolvePublicFile(vite.config.root, req.url?.split('?')[0] ?? '/');

            if (publicFile) {
              res.writeHead(200, { 'content-type': mimeFor(publicFile) });
              res.end(readFileSync(publicFile));

              return;
            }
            const server = await januxServer();
            const response = await server.fetch(await toFetchRequest(req));
            // A 404 falls through to Vite only when it's a genuine page-router
            // miss. Framework endpoints (`/_janux/*`) and `src/api/**` handlers
            // own their responses — a handler's real 404 (e.g. a proxied
            // upstream 404) must be sent as-is, never masked by Vite's fallback.
            const path = req.url?.split('?')[0] ?? '/';
            const handled = path.startsWith('/_janux/') || path.startsWith('/api/');

            if (response.status === 404 && !handled) return next();
            await sendFetchResponse(res, response);
          };

          handle().catch(next);
        });
      };
    },
  };
}
