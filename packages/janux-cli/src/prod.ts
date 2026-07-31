import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defineAgent } from '@janux/agent';
import type { ServerOptions } from '@janux/server';
import { apiFiles, apiModuleName, mcpAuthOptions, resolveAppConfig, shellOptions, type JanuxAppConfig } from '@janux/vite/config';

/**
 * The production wiring, kept away from the build commands on purpose.
 *
 * `dev` and `build` need Vite and @swc/core; a running server needs neither, and
 * importing them anyway is not free: a serverless bundle of this module used to
 * drag the whole toolchain in and fail to resolve `@swc/wasm` — the fallback
 * binding @swc/core reaches for when it has no native one. Hence
 * `@janux/vite/config` (app conventions, no bundler) and `@janux/cli/prod`.
 */

/**
 * An app whose modules were resolved at build time instead of at boot.
 *
 * Bun runs an app's own source, so the server imports it on the way up. That
 * only works where the source and its dependencies are on disk together — a
 * bundled deployment (a serverless function) has the bundle and nothing to
 * resolve `janux` from. A platform adapter therefore imports the app's modules
 * *statically*, so the bundler inlines them, and hands the result over here:
 * same wiring, no imports at boot. Keys are absolute paths, built from the
 * running root — the build machine's paths are not the runtime's.
 */
export interface PrebuiltApp {
  config: JanuxAppConfig;
  modules: Record<string, Record<string, unknown>>;
}

/**
 * `inlineStyles`: the sheet the bundler just emitted, read back so the shell can
 * embed it. Absent before the first build — the shell falls back to the link.
 */
async function builtStyles(root: string, app: { inlineStyles?: boolean }): Promise<string[] | undefined> {
  if (!app.inlineStyles) return undefined;
  const sheet = join(root, 'dist/client/styles.css');

  return existsSync(sheet) ? [await readFile(sheet, 'utf8')] : undefined;
}

/**
 * The island catalog the client build emitted (see @janux/vite `islands.json`).
 * A page whose only islands sit behind suspense boundaries has an empty SSR
 * registry when the streaming interlude flushes — without this map the shell
 * gates the runtime on that registry and the page never boots.
 */
async function builtIslandModules(root: string): Promise<Record<string, string> | undefined> {
  const catalog = join(root, 'dist/client/islands.json');

  return existsSync(catalog) ? JSON.parse(await readFile(catalog, 'utf8')) : undefined;
}

type Loader = (file: string) => Promise<Record<string, unknown>>;

/** A prebuilt app looks its modules up; everything else imports them. */
function moduleLoader(prebuilt: PrebuiltApp | undefined): Loader {
  if (!prebuilt) return (file) => import(file);

  return async (file) => {
    const module = prebuilt.modules[file];

    if (!module) throw new Error(`janux: ${file} is missing from the prebuilt app — re-run the deployment build.`);

    return module;
  };
}

async function optionalModule(load: Loader, file: string | undefined): Promise<Record<string, any> | undefined> {
  return file ? load(file) : undefined;
}

export async function prodServerOptions(root: string, prebuilt?: PrebuiltApp): Promise<ServerOptions> {
  const app = prebuilt?.config ?? (await resolveAppConfig(root));
  const load = moduleLoader(prebuilt);
  const inlineStyles = await builtStyles(root, app);
  const apiModules = Object.fromEntries(
    await Promise.all(apiFiles(app.serverDir).map(async (file) => [apiModuleName(file), await load(file)])),
  );
  const agentModule = await optionalModule(load, app.agentModule);
  const storesModule = await optionalModule(load, app.storesModule);
  const i18nModule = await optionalModule(load, app.i18nModule);
  const middlewareModule = await optionalModule(load, app.middlewareModule);
  const ctxModule = await optionalModule(load, app.ctxModule);
  const matchersModule = await optionalModule(load, app.matchersModule);
  const websocketModule = await optionalModule(load, app.websocketModule);

  return {
    routesDir: app.routesDir,
    loadRoute: prebuilt ? (file) => load(file) : undefined,
    apis: apiModules,
    agent: agentModule?.default ?? defineAgent(),
    storeDefs: storesModule ?? {},
    runtimeUrl: existsSync(join(root, 'dist/client/client.js')) ? '/client.js' : undefined,
    islandModules: await builtIslandModules(root),
    ...shellOptions(app, app.stylesheet && !inlineStyles ? ['/styles.css'] : []),
    inlineStyles,
    llmsTxt: app.llmsTxt,
    i18n: i18nModule?.default,
    middleware: middlewareModule?.default,
    ctxFor: ctxModule?.default,
    matchers: matchersModule,
    websocket: websocketModule?.default,
    mcpAuth: mcpAuthOptions(app.mcpAuth),
    agents: app.agents,
    httpHandlers: app.httpHandlersDir ? { dir: app.httpHandlersDir, loadModule: load as any } : undefined,
    // Foreign runtime (react) resolved from the app root — see @janux/vite.
    foreignImport: (spec) => import(createRequire(join(root, 'package.json')).resolve(spec)),
  };
}
