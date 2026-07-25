import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ServerOptions } from '@janux/server';
import type { JanuxConfig, JanuxOutput } from 'janux';

export type { JanuxOutput } from 'janux';

export type JanuxPluginOptions = JanuxConfig;

export interface JanuxAppConfig {
  root: string;
  routesDir: string;
  serverDir: string;
  clientEntry: string;
  agentModule?: string;
  storesModule?: string;
  i18nModule?: string;
  middlewareModule?: string;
  ctxModule?: string;
  matchersModule?: string;
  httpHandlersDir?: string;
  stylesheet?: string;
  favicon?: string;
  title?: string;
  lang?: string;
  llmsTxt?: { title?: string; description?: string };
  output: JanuxOutput;
}

const CONFIG_FILES = ['janux.config.ts', 'janux.config.js'];

function optional(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

/** Deprecated fallback: a `"janux"` field in the app's package.json (`janux.config.ts` wins over it). */
function packageJsonOptions(root: string): JanuxPluginOptions {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).janux ?? {};
  } catch {
    return {};
  }
}

/** `janux.config.(ts|js)` default export. The mtime query busts the ESM cache so dev picks up edits. */
async function configFileOptions(root: string): Promise<JanuxConfig> {
  const file = CONFIG_FILES.map((name) => join(root, name)).find(existsSync);

  if (!file) return {};
  const url = `${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`;

  return (await import(/* @vite-ignore */ url)).default ?? {};
}

/** Resolves the conventional app layout: src/routes, src/server, src/client.ts, src/agent.ts, src/stores.ts. */
export async function resolveAppConfig(root: string, pluginOptions: JanuxPluginOptions = {}): Promise<JanuxAppConfig> {
  const options = { ...packageJsonOptions(root), ...(await configFileOptions(root)), ...pluginOptions };

  return {
    root,
    routesDir: resolve(root, options.routesDir ?? 'src/routes'),
    serverDir: resolve(root, options.serverDir ?? 'src/server'),
    clientEntry: options.clientEntry ?? optional(resolve(root, 'src/client.ts')) ?? '',
    agentModule: options.agentModule ?? optional(resolve(root, 'src/agent.ts')),
    storesModule: options.storesModule ?? optional(resolve(root, 'src/stores.ts')),
    i18nModule: optional(resolve(root, 'src/i18n.ts')) ?? optional(resolve(root, 'src/i18n/index.ts')),
    middlewareModule: optional(resolve(root, 'src/middleware.ts')),
    ctxModule: optional(resolve(root, 'src/ctx.ts')),
    matchersModule: optional(resolve(root, 'src/matchers.ts')),
    httpHandlersDir: optional(resolve(root, 'src/api')),
    stylesheet: optional(resolve(root, 'src/styles.css')),
    favicon: optional(resolve(root, 'public/favicon.svg')) ? '/favicon.svg' : undefined,
    title: options.title,
    lang: options.lang,
    llmsTxt: options.llmsTxt,
    output: options.output ?? 'bun',
  };
}

/**
 * The `ServerOptions` fields the HTML shell reads. Dev (the Vite plugin) and
 * prod (`janux build` / `janux start`) resolve the same app config, so they map
 * these in one place: the favicon was wired in dev and forgotten in prod, and
 * every build shipped a shell with no icon link — a 404 `/favicon.ico` on every
 * page. The stylesheet URL is the one field that legitimately differs, so it
 * comes from the caller.
 */
export function shellOptions(
  app: JanuxAppConfig,
  stylesheets: string[],
): Pick<ServerOptions, 'title' | 'lang' | 'favicon' | 'stylesheets'> {
  return { title: app.title, lang: app.lang, favicon: app.favicon, stylesheets };
}

export function apiFiles(serverDir: string): string[] {
  if (!existsSync(serverDir)) return [];

  return readdirSync(serverDir)
    .filter((entry) => /\.api\.[tj]s$/.test(entry))
    .map((entry) => join(serverDir, entry));
}
