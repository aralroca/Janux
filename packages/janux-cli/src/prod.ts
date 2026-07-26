import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defineAgent } from '@janux/agent';
import type { ServerOptions } from '@janux/server';
import { apiFiles, apiModuleName, resolveAppConfig, shellOptions } from '@janux/vite/config';

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
 * `inlineStyles`: the sheet the bundler just emitted, read back so the shell can
 * embed it. Absent before the first build — the shell falls back to the link.
 */
async function builtStyles(root: string, app: { inlineStyles?: boolean }): Promise<string[] | undefined> {
  if (!app.inlineStyles) return undefined;
  const sheet = Bun.file(join(root, 'dist/client/styles.css'));

  return (await sheet.exists()) ? [await sheet.text()] : undefined;
}

export async function prodServerOptions(root: string): Promise<ServerOptions> {
  const app = await resolveAppConfig(root);
  const inlineStyles = await builtStyles(root, app);
  const apiModules = Object.fromEntries(
    await Promise.all(
      apiFiles(app.serverDir).map(async (file) => [apiModuleName(file), await import(file)]),
    ),
  );
  const agentModule = app.agentModule ? await import(app.agentModule) : undefined;
  const storesModule = app.storesModule ? await import(app.storesModule) : undefined;
  const i18nModule = app.i18nModule ? await import(app.i18nModule) : undefined;
  const middlewareModule = app.middlewareModule ? await import(app.middlewareModule) : undefined;
  const ctxModule = app.ctxModule ? await import(app.ctxModule) : undefined;
  const matchersModule = app.matchersModule ? await import(app.matchersModule) : undefined;

  return {
    routesDir: app.routesDir,
    apis: apiModules,
    agent: agentModule?.default ?? defineAgent(),
    storeDefs: storesModule ?? {},
    runtimeUrl: existsSync(join(root, 'dist/client/client.js')) ? '/client.js' : undefined,
    ...shellOptions(app, app.stylesheet && !inlineStyles ? ['/styles.css'] : []),
    inlineStyles,
    llmsTxt: app.llmsTxt,
    i18n: i18nModule?.default,
    middleware: middlewareModule?.default,
    ctxFor: ctxModule?.default,
    matchers: matchersModule,
    httpHandlers: app.httpHandlersDir
      ? { dir: app.httpHandlersDir, loadModule: (file) => import(file) as any }
      : undefined,
    // Foreign runtime (react) resolved from the app root — see @janux/vite.
    foreignImport: (spec) => import(createRequire(join(root, 'package.json')).resolve(spec)),
  };
}
