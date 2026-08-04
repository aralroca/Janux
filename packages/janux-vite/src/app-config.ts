import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverSkills, type ServerOptions, type Skill } from '@janux/server';
import type {
  AgentsAuthConfig,
  CacheConfig,
  CspConfig,
  FeedConfig,
  FontConfig,
  JanuxConfig,
  JanuxOutput,
  McpAuthConfig,
  NavigationConfig,
} from 'janux';

export type { JanuxOutput } from 'janux';
export { registerInstrumentation, type InstrumentationModule } from './instrumentation';
/*
 * Re-exported here, beside `shellOptions`, because they are used together and
 * because this is the entry a production server imports. Reaching the package
 * ROOT for it instead pulls in the Vite plugin — and with it @swc/core, which
 * the Vercel adapter then tries to bundle into a serverless function, where its
 * native binding does not exist.
 */
export { builtFontAssets } from './fonts';
export { scheduleFiles, scheduleName, scheduleConfigFile, scheduleServerOptions } from './schedules';

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
  /** `src/session.ts`, whose default export is the app's `SessionStore`. */
  sessionModule?: string;
  matchersModule?: string;
  websocketModule?: string;
  /** `src/schedules/`, when the app has one — each file is a schedule (see `schedules.ts`). */
  schedulesDir?: string;
  /**
   * `src/skills/**`, parsed. Data rather than a directory, so a bundled
   * deployment carries the procedures inside its config instead of hoping the
   * markdown made it into the serverless function.
   */
  skills: Skill[];
  /** `src/feed.ts`, whose default export is the app's `FeedConfig`. */
  feedModule?: string;
  /** `src/instrumentation.ts`, loaded and `register()`ed before the server serves. */
  instrumentationModule?: string;
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
  /** Fonts to self-host, as declared in janux.config.ts. */
  fonts: FontConfig[];
  navigation?: NavigationConfig;
  csp?: boolean | CspConfig;
  cache?: CacheConfig;
}

const CONFIG_FILES = ['janux.config.ts', 'janux.config.js'];

function optional(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

/**
 * The app's own stylesheet entry, in precedence order. Vite compiles whichever
 * one it finds, and the build renames the emitted asset to `/styles.css` — the
 * single sheet the HTML shell links — so a preprocessor is a file extension,
 * not a configuration step.
 */
const STYLESHEETS = ['styles.css', 'styles.scss', 'styles.sass', 'styles.less'];

function stylesheet(root: string): string | undefined {
  return STYLESHEETS.map((name) => optional(resolve(root, 'src', name))).find(Boolean);
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

/**
 * The app root, published for the app's own modules to read.
 *
 * A module that finds its data files with `import.meta.dirname` gets the
 * *bundle's* directory once bundled, which is why the Vercel adapter has always
 * set this before importing the app. Every path that boots an app publishes it
 * too, so `dir: 'content/notes'` is not secretly a promise about the working
 * directory.
 *
 * Called when an app is *served*, never merely when its config is read: tooling
 * resolves the config of apps it will not run, and a stale root is worse than
 * no root — it points a running app's modules at someone else's files.
 */
export function publishAppRoot(root: string): void {
  process.env.JANUX_APP_ROOT = root;
}

/**
 * A path in its forward-slash form, whatever OS produced it.
 *
 * Everything the framework derives from `relative()` — generated import
 * specifiers, dev URLs, the route reports `janux info` prints — must read the
 * same on Windows, where `relative()` answers with backslashes.
 */
export function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
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
    sessionModule: optional(resolve(root, 'src/session.ts')),
    matchersModule: optional(resolve(root, 'src/matchers.ts')),
    websocketModule: options.websocket ? resolve(root, options.websocket) : optional(resolve(root, 'src/ws.ts')),
    schedulesDir: optional(resolve(root, 'src/schedules')),
    skills: discoverSkills(resolve(root, 'src/skills')),
    feedModule: optional(resolve(root, 'src/feed.ts')),
    instrumentationModule: optional(resolve(root, 'src/instrumentation.ts')),
    mcpAuth: options.mcpAuth,
    agents: options.agents,
    httpHandlersDir: optional(resolve(root, 'src/api')),
    stylesheet: stylesheet(root),
    favicon: optional(resolve(root, 'public/favicon.svg')) ? '/favicon.svg' : undefined,
    title: options.title,
    lang: options.lang,
    siteUrl: options.siteUrl,
    inlineStyles: options.inlineStyles,
    llmsTxt: options.llmsTxt,
    output: options.output ?? 'bun',
    fonts: options.fonts ?? [],
    navigation: options.navigation,
    csp: options.csp,
    cache: options.cache,
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
  fonts: Pick<ServerOptions, 'fontFaces' | 'fontPreloads'> = {},
): Pick<
  ServerOptions,
  | 'title'
  | 'lang'
  | 'siteUrl'
  | 'favicon'
  | 'stylesheets'
  | 'navigation'
  | 'csp'
  | 'cache'
  | 'fontFaces'
  | 'fontPreloads'
> {
  return {
    title: app.title,
    lang: app.lang,
    siteUrl: app.siteUrl,
    favicon: app.favicon,
    stylesheets,
    navigation: app.navigation,
    csp: app.csp,
    cache: app.cache,
    ...fonts,
  };
}

/**
 * `mcpAuth` in janux.config.ts → the bearer verifier `ServerOptions` takes.
 * The env var (`tokenEnv`) is read here, at boot, and wins over the literal
 * `token`; declaring neither leaves the endpoint open, exactly as before.
 */
export function mcpAuthOptions(config: McpAuthConfig | undefined): ServerOptions['mcpAuth'] {
  const fromEnv = config?.tokenEnv ? process.env[config.tokenEnv] : undefined;
  const token = fromEnv ?? config?.token;

  // Declaring tokenEnv is a statement that the endpoint is protected: a missing
  // secret must stop the boot, never quietly serve every tool to anyone.
  if (config?.tokenEnv && !fromEnv && !config.token) {
    throw new Error(
      `Janux: mcpAuth.tokenEnv "${config.tokenEnv}" is not set — refusing to serve /_janux/mcp unauthenticated`,
    );
  }
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
