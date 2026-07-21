import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface JanuxAppConfig {
  root: string;
  routesDir: string;
  serverDir: string;
  clientEntry: string;
  agentModule?: string;
  storesModule?: string;
  stylesheet?: string;
  title?: string;
}

export interface JanuxPluginOptions {
  routesDir?: string;
  serverDir?: string;
  clientEntry?: string;
  agentModule?: string;
  storesModule?: string;
  title?: string;
}

function optional(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

/** Resolves the conventional app layout: src/routes, src/server, src/client.ts, src/agent.ts, src/stores.ts. */
export function resolveAppConfig(root: string, options: JanuxPluginOptions = {}): JanuxAppConfig {
  return {
    root,
    routesDir: resolve(root, options.routesDir ?? 'src/routes'),
    serverDir: resolve(root, options.serverDir ?? 'src/server'),
    clientEntry: options.clientEntry ?? optional(resolve(root, 'src/client.ts')) ?? '',
    agentModule: options.agentModule ?? optional(resolve(root, 'src/agent.ts')),
    storesModule: options.storesModule ?? optional(resolve(root, 'src/stores.ts')),
    stylesheet: optional(resolve(root, 'src/styles.css')),
    title: options.title,
  };
}

export function apiFiles(serverDir: string): string[] {
  if (!existsSync(serverDir)) return [];

  return readdirSync(serverDir)
    .filter((entry) => /\.api\.[tj]s$/.test(entry))
    .map((entry) => join(serverDir, entry));
}
