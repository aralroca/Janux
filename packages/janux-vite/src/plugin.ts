import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { createJanuxServer, type ServerOptions } from '@janux/server';
import { fontFaceCss, fontPreloadHrefs } from 'janux';
import { defineAgent } from '@janux/agent';
import { packageDir, runtimeIncludes } from './deps';
import { mimeFor, resolvePublicFile } from './static-files';
import { imageResponse } from './image-optimizer';
import { fontResponse, resolveFonts } from './fonts';
import {
  apiFiles,
  mcpAuthOptions,
  publishAppRoot,
  registerInstrumentation,
  resolveAppConfig,
  routingOptions,
  shellOptions,
  toPosix,
  type JanuxPluginOptions,
} from './app-config';
import { apiModuleName, apiStubModule } from './api-stubs';
import { scheduleServerOptions } from './schedules';
import { channelServerOptions } from './channels';
import { compileClientModule } from './binding-sites';
import { extractIntentRun, parseIntentVirtualId, splitClientModule } from './intent-split';
import { collectIslands, islandCatalogFromDir } from './islands';
import { attachDevWebSocket } from './dev-websocket';
import { DEV_ROUTE_PATH, devRouteHandler } from './dev-route-info';
import { sendFetchResponse, toFetchRequest } from './request-adapter';

const SSR_PACKAGES = ['janux', '@janux/server', '@janux/agent'];

async function loadServerOptions(vite: ViteDevServer, options: JanuxPluginOptions): Promise<ServerOptions> {
  // Here rather than in `config()`: this is the moment the app's own modules
  // are loaded, and `config()` also runs for `janux build`, where publishing an
  // app root means nothing.
  publishAppRoot(vite.config.root);
  const app = await resolveAppConfig(vite.config.root, options);
  // Resolved here rather than per request: the first `janux dev` downloads, every
  // one after it reads the cache, and the page sees what the build will ship.
  const fonts = await resolveFonts(vite.config.root, app.fonts);

  // Same ordering guarantee dev owes prod: instrumented before anything serves.
  await registerInstrumentation(app.instrumentationModule, (file) => vite.ssrLoadModule(file));
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
  const sessionModule = app.sessionModule ? await vite.ssrLoadModule(app.sessionModule) : undefined;
  const matchersModule = app.matchersModule ? await vite.ssrLoadModule(app.matchersModule) : undefined;
  const websocketModule = app.websocketModule ? await vite.ssrLoadModule(app.websocketModule) : undefined;
  const feedModule = app.feedModule ? await vite.ssrLoadModule(app.feedModule) : undefined;

  return {
    routesDir: app.routesDir,
    loadRoute: (filePath) => vite.ssrLoadModule(filePath),
    apis: apiModules,
    agent: (agentModule?.default as ServerOptions['agent']) ?? defineAgent(),
    storeDefs: (storesModule ?? {}) as ServerOptions['storeDefs'],
    runtimeUrl: app.clientEntry ? `/${relativeToRoot(vite.config.root, app.clientEntry)}` : undefined,
    // Dev bundles nothing, so the build's islands.json is derived from source:
    // without it a suspense-only page ships no runtime under `janux dev`.
    islandModules: islandCatalogFromDir(join(vite.config.root, 'src')),
    // Dev registers no worker, but the origin may already carry one from a
    // `janux start` on this port: it would answer Vite's URLs out of a cache
    // belonging to a build that no longer exists. Reclaim it.
    reclaimServiceWorker: true,
    ...shellOptions(app, devStylesheets(vite.config.root, app.stylesheet), {
      fontFaces: fontFaceCss(fonts) || undefined,
      fontPreloads: fontPreloadHrefs(fonts),
    }),
    ...routingOptions(app),
    llmsTxt: app.llmsTxt,
    feed: feedModule?.default as ServerOptions['feed'],
    websocket: websocketModule?.default as ServerOptions['websocket'],
    // Dev is a persistent process, so schedules tick in-process, like prod on Bun.
    schedules: await scheduleServerOptions(app, (file) => vite.ssrLoadModule(file) as any),
    channels: await channelServerOptions(app, (file) => vite.ssrLoadModule(file) as any),
    skills: app.skills,
    mcpAuth: mcpAuthOptions(app.mcpAuth),
    agents: app.agents,
    i18n: i18nModule?.default as ServerOptions['i18n'],
    foreignImport: appForeignImport(vite.config.root),
    middleware: middlewareModule?.default as ServerOptions['middleware'],
    ctxFor: ctxModule?.default as ServerOptions['ctxFor'],
    session: sessionModule?.default as ServerOptions['session'],
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

/** Forward-slash, whatever the OS: every caller builds a URL or a Vite entry from it. */
function relativeToRoot(root: string, absolute: string): string {
  return toPosix(absolute.startsWith(root) ? absolute.slice(root.length + 1) : absolute);
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
 * Whether a Vite module id is one of the *app's* api modules — inside its
 * server directory and named `*.api.ts|js`. The config carries the directory as
 * a native path while Vite's ids are forward-slashed on every OS, so on Windows
 * a raw prefix test never matches and the stub transform silently stops; both
 * sides are compared in their forward-slash form.
 */
export function isApiModule(serverDir: string, id: string): boolean {
  return toPosix(id).startsWith(`${toPosix(serverDir)}/`) && /\.api\.[tj]s($|\?)/.test(id);
}

/**
 * A 404 falls through to Vite only when it is a genuine page-router miss with
 * nothing to show. Framework endpoints (`/_janux/*`) and `src/api/**` handlers
 * own their responses — a handler's real 404 (e.g. a proxied upstream 404) must
 * be sent as-is, never masked by Vite's fallback — and so does an app with a
 * `_404` page, whose rendered document arrives as HTML.
 */
export function fallsThroughToVite(response: Response, path: string): boolean {
  if (response.status !== 404) return false;
  const owned = path.startsWith('/_janux/') || path.startsWith('/api/');
  const rendered = response.headers.get('content-type')?.includes('text/html');

  return !owned && !rendered;
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

/**
 * What dev answers before the app does: a file the app put in `public/`, a
 * self-hosted font out of the resolver's cache, or an image variant derived
 * from a public file. All three are the URLs `janux build` writes to disk,
 * produced on demand here — so the page you are writing and the page you ship
 * pick from the same files.
 */
export async function devAsset(root: string, path: string): Promise<Response | undefined> {
  const publicFile = resolvePublicFile(root, path);

  if (!publicFile) return fontResponse(root, path) ?? imageResponse(root, path);

  return new Response(readFileSync(publicFile), { headers: { 'content-type': mimeFor(publicFile) } });
}

/** The Janux Vite plugin: JSX runtime config, api() client stubs (SWC) and the SSR dev bridge. */
export function janux(options: JanuxPluginOptions = {}): Plugin {
  /** Where the app keeps its `*.api.ts` modules, learned in `config`. */
  let serverDir = '';
  /** Island defs met while bundling the client graph — the build's catalog, see islands.ts. */
  const islandCatalog: Record<string, string> = {};
  let bundling = false;
  /** The compiler evolution's switches, resolved with the app config. */
  let bindingMaps = false;
  let splitIntents = false;

  return {
    name: 'janux',

    async config(config, env) {
      bundling = env.command === 'build';
      const root = resolve(config.root ?? process.cwd());
      const app = await resolveAppConfig(root, options);
      const { clientEntry } = app;

      serverDir = app.serverDir;
      bindingMaps = app.compiler?.bindingMaps ?? true;
      splitIntents = app.compiler?.splitIntents ?? false;

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
      if (bundling && !transformOptions?.ssr) collectIslands(islandCatalog, id, code);
      if (serverDir && isApiModule(serverDir, id)) {
        return transformOptions?.ssr ? undefined : { code: apiStubModule(id, code), map: null };
      }
      // After the api stubs on purpose: a server module never reaches this,
      // so the compiler cannot interfere with "server code stays server-side".
      if (!transformOptions?.ssr) {
        const bound = bindingMaps ? compileClientModule(id, code) : undefined;
        const split = splitIntents ? splitClientModule(id, bound ?? code) : undefined;

        if (bound || split) return { code: split ?? bound!, map: null };
      }

      return undefined;
    },

    /** The intent chunks' scheme, and relative imports made from inside them. */
    resolveId(source, importer) {
      if (source.startsWith('janux-intent:')) return `\0${source}`;
      const virtual = importer ? parseIntentVirtualId(importer) : undefined;

      // A virtual module carries its original module's imports verbatim, so
      // its relative specifiers resolve against the original file.
      return virtual ? this.resolve(source, virtual.module, { skipSelf: true }).then((r) => r?.id) : undefined;
    },

    load(id) {
      const virtual = parseIntentVirtualId(id);

      if (!virtual) return undefined;
      // Re-derived from disk on every load (and watched): a dev edit to the
      // original module can never serve a stale run.
      this.addWatchFile(virtual.module);
      const code = extractIntentRun(
        readFileSync(virtual.module, 'utf8'),
        virtual.module.split('?')[0]!.endsWith('x'),
        virtual.island,
        virtual.intent,
      );

      return code ? { code, map: null } : undefined;
    },

    /** The island catalog, read back by `prodServerOptions` as `islandModules`. */
    generateBundle() {
      if (Object.keys(islandCatalog).length === 0) return;
      this.emitFile({ type: 'asset', fileName: 'islands.json', source: JSON.stringify(islandCatalog) });
    },

    configureServer(vite) {
      let cached: Promise<ReturnType<typeof createJanuxServer>> | undefined;

      const januxServer = () => {
        cached ??= loadServerOptions(vite, options).then(createJanuxServer);

        return cached;
      };

      /**
       * A rebuilt server brings a new scheduler with it, so the old one has to
       * be stopped: nothing else ever will, and a day of editing would leave a
       * tick loop per save — each running the handlers it was built with, all
       * competing for the same claims.
       */
      const discardServer = () => {
        const previous = cached;

        cached = undefined;
        previous?.then((server) => server.stop()).catch(() => undefined);
      };

      vite.watcher.on('change', discardServer);
      vite.httpServer?.on('close', discardServer);

      const loadWebSocket = async () => {
        const app = await resolveAppConfig(vite.config.root, options);
        const module = app.websocketModule ? await vite.ssrLoadModule(app.websocketModule) : undefined;

        return module?.default as ServerOptions['websocket'];
      };

      attachDevWebSocket(vite, loadWebSocket);

      return () => {
        vite.middlewares.use((req, res, next) => {
          const handle = async () => {
            const asset = await devAsset(vite.config.root, req.url?.split('?')[0] ?? '/');

            if (asset) return sendFetchResponse(res, asset);
            // The dev overlay asking which route file and `_layout` chain
            // answered a URL. Resolved before the app sees it, and only for
            // that exact path — a built app has no Vite and no such endpoint.
            // It routes with the app's own matchers, like the dev server does.
            if (req.url?.startsWith(DEV_ROUTE_PATH)) {
              const app = await resolveAppConfig(vite.config.root, options);
              const devRoute = await devRouteHandler(vite.config.root, app, vite.ssrLoadModule, req.url);

              if (devRoute) return sendFetchResponse(res, devRoute);
            }
            const server = await januxServer();
            const response = await server.fetch(await toFetchRequest(req));

            if (fallsThroughToVite(response, req.url?.split('?')[0] ?? '/')) return next();
            await sendFetchResponse(res, response);
          };

          handle().catch(next);
        });
      };
    },
  };
}
