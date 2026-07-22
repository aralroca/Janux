import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type JanuxOutput = 'bun' | 'static';

export interface JanuxAppConfig {
  root: string;
  routesDir: string;
  serverDir: string;
  clientEntry: string;
  agentModule?: string;
  storesModule?: string;
  stylesheet?: string;
  favicon?: string;
  title?: string;
  llmsTxt?: { title?: string; description?: string };
  output: JanuxOutput;
}

export interface JanuxPluginOptions {
  routesDir?: string;
  serverDir?: string;
  clientEntry?: string;
  agentModule?: string;
  storesModule?: string;
  title?: string;
  llmsTxt?: { title?: string; description?: string };
  output?: JanuxOutput;
}

function optional(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

/** Optional per-app config: a `"janux"` field in the app's package.json (plugin options win over it). */
function packageJsonOptions(root: string): JanuxPluginOptions {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).janux ?? {};
  } catch {
    return {};
  }
}

/** Resolves the conventional app layout: src/routes, src/server, src/client.ts, src/agent.ts, src/stores.ts. */
export function resolveAppConfig(root: string, pluginOptions: JanuxPluginOptions = {}): JanuxAppConfig {
  const options = { ...packageJsonOptions(root), ...pluginOptions };

  return {
    root,
    routesDir: resolve(root, options.routesDir ?? 'src/routes'),
    serverDir: resolve(root, options.serverDir ?? 'src/server'),
    clientEntry: options.clientEntry ?? optional(resolve(root, 'src/client.ts')) ?? '',
    agentModule: options.agentModule ?? optional(resolve(root, 'src/agent.ts')),
    storesModule: options.storesModule ?? optional(resolve(root, 'src/stores.ts')),
    stylesheet: optional(resolve(root, 'src/styles.css')),
    favicon: optional(resolve(root, 'public/favicon.svg')) ? '/favicon.svg' : undefined,
    title: options.title,
    llmsTxt: options.llmsTxt,
    output: options.output ?? 'bun',
  };
}

export function apiFiles(serverDir: string): string[] {
  if (!existsSync(serverDir)) return [];

  return readdirSync(serverDir)
    .filter((entry) => /\.api\.[tj]s$/.test(entry))
    .map((entry) => join(serverDir, entry));
}
