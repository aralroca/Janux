import { readFileSync } from 'node:fs';
import type { Plugin, ViteDevServer } from 'vite';
import { createJanuxServer, type ServerOptions } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { mimeFor, resolvePublicFile } from './static-files';
import { apiFiles, resolveAppConfig, type JanuxPluginOptions } from './app-config';
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

  return {
    routesDir: app.routesDir,
    loadRoute: (filePath) => vite.ssrLoadModule(filePath),
    apis: apiModules,
    agent: (agentModule?.default as ServerOptions['agent']) ?? defineAgent(),
    storeDefs: (storesModule ?? {}) as ServerOptions['storeDefs'],
    runtimeUrl: app.clientEntry ? `/${relativeToRoot(vite.config.root, app.clientEntry)}` : undefined,
    stylesheets: app.stylesheet ? [`/${relativeToRoot(vite.config.root, app.stylesheet)}`] : [],
    favicon: app.favicon,
    title: app.title,
    llmsTxt: app.llmsTxt,
    i18n: i18nModule?.default as ServerOptions['i18n'],
  };
}

function relativeToRoot(root: string, absolute: string): string {
  return absolute.startsWith(root) ? absolute.slice(root.length + 1) : absolute;
}

/** The Janux Vite plugin: JSX runtime config, api() client stubs (SWC) and the SSR dev bridge. */
export function janux(options: JanuxPluginOptions = {}): Plugin {
  return {
    name: 'janux',

    config() {
      return {
        appType: 'custom',
        esbuild: { jsx: 'automatic', jsxImportSource: 'janux' },
        resolve: { dedupe: ['janux'] },
        ssr: { noExternal: SSR_PACKAGES },
        optimizeDeps: { exclude: SSR_PACKAGES },
      };
    },

    transform(code, id, transformOptions) {
      if (!/\.api\.[tj]s($|\?)/.test(id)) return undefined;
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

            if (response.status === 404 && !req.url?.startsWith('/_janux/')) return next();
            await sendFetchResponse(res, response);
          };

          handle().catch(next);
        });
      };
    },
  };
}
