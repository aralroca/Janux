import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ServerOptions } from '@janux/server';
import type { AgentsAuthConfig, JanuxConfig, JanuxOutput, McpAuthConfig, NavigationConfig } from 'janux';

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
  websocketModule?: string;
  mcpAuth?: McpAuthConfig;
  agents?: AgentsAuthConfig;
  httpHandlersDir?: string;
  stylesheet?: string;
  favicon?: string;
  title?: string;
  lang?: string;
  siteUrl?: string;
  inlineStyles?: boolean;
  llmsTxt?: { title?: string; description?: string };
  output: JanuxOutput;
  navigation?: NavigationConfig;
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
    websocketModule: options.websocket ? resolve(root, options.websocket) : optional(resolve(root, 'src/ws.ts')),
    mcpAuth: options.mcpAuth,
    agents: options.agents,
    httpHandlersDir: optional(resolve(root, 'src/api')),
    stylesheet: optional(resolve(root, 'src/styles.css')),
    favicon: optional(resolve(root, 'public/favicon.svg')) ? '/favicon.svg' : undefined,
    title: options.title,
    lang: options.lang,
    siteUrl: options.siteUrl,
    inlineStyles: options.inlineStyles,
    llmsTxt: options.llmsTxt,
    output: options.output ?? 'bun',
    navigation: options.navigation,
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
): Pick<ServerOptions, 'title' | 'lang' | 'siteUrl' | 'favicon' | 'stylesheets' | 'navigation'> {
  return {
    title: app.title,
    lang: app.lang,
    siteUrl: app.siteUrl,
    favicon: app.favicon,
    stylesheets,
    navigation: app.navigation,
  };
}

/**
 * `mcpAuth` in janux.config.ts → the bearer verifier `ServerOptions` takes.
 * The env var (`tokenEnv`) is read here, at boot, and wins over the literal
 * `token`; with neither the endpoint stays open, exactly as before.
 */
export function mcpAuthOptions(config: McpAuthConfig | undefined): ServerOptions['mcpAuth'] {
  const fromEnv = config?.tokenEnv ? process.env[config.tokenEnv] : undefined;
  const token = fromEnv ?? config?.token;

  if (!token) return undefined;

  return {
    verify: (candidate) => (candidate === token ? { method: 'bearer' } : null),
    resourceMetadataUrl: config?.resourceMetadataUrl,
  };
}

export function apiFiles(serverDir: string): string[] {
  if (!existsSync(serverDir)) return [];

  return readdirSync(serverDir)
    .filter((entry) => /\.api\.[tj]s$/.test(entry))
    .map((entry) => join(serverDir, entry));
}

/** `src/server/shop.api.ts` → `shop`: the prefix its exports get as tools. */
export function apiModuleName(filePath: string): string {
  return basename(filePath).replace(/\.api\.[tj]s$/, '');
}
