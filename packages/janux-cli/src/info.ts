import { existsSync, readFileSync } from 'node:fs';
import { release } from 'node:os';
import { join, relative } from 'node:path';
import { createFsRouter } from '@janux/server';
import { packageDir, resolveAppConfig } from '@janux/vite';
import { renderInfoMarkdown } from './info-report';
import type { CliCommand } from './args';

/**
 * `janux info` — the answer to "what were you running?", written to be pasted
 * into an issue unedited.
 *
 * Which is also why it reports paths relative to the app root and never the
 * root itself: nobody should have to redact their home directory before asking
 * for help. Zero-config integrations are the other reason this command exists —
 * installing `@janux/tailwind` IS the configuration, so nothing in the app's
 * own source says whether it is on.
 */

export interface PackagePresence {
  name: string;
  /** `undefined` when the package is not installed — reported as absent, not omitted. */
  version?: string;
}

export interface RouteInfo {
  pattern: string;
  file: string;
  layouts: string[];
}

export interface JanuxInfo {
  versions: { janux?: string; cli?: string; bun: string; os: string };
  app: { name?: string; version?: string };
  config: Record<string, string | undefined>;
  adapters: PackagePresence[];
  integrations: PackagePresence[];
  routes: RouteInfo[];
}

/** Deployment adapters and zero-config integrations Janux knows how to detect. */
const ADAPTERS = ['@janux/vercel'];
const INTEGRATIONS = ['@janux/tailwind'];

function readPackage(dir: string | undefined): Record<string, string> | undefined {
  const file = dir && join(dir, 'package.json');

  if (!file || !existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function presence(name: string, root: string): PackagePresence {
  return { name, version: readPackage(packageDir(name, root))?.version };
}

/** Config values are paths; the report shows them relative to the root, which is the part that matters. */
function relativeTo(root: string, value: string | undefined): string | undefined {
  return value ? relative(root, value) : undefined;
}

function configOf(app: Awaited<ReturnType<typeof resolveAppConfig>>, root: string): JanuxInfo['config'] {
  return {
    output: app.output,
    routesDir: relativeTo(root, app.routesDir),
    clientEntry: relativeTo(root, app.clientEntry),
    stylesheet: relativeTo(root, app.stylesheet),
    agentModule: relativeTo(root, app.agentModule),
    i18nModule: relativeTo(root, app.i18nModule),
  };
}

function routesOf(routesDir: string, root: string): RouteInfo[] {
  if (!existsSync(routesDir)) return [];

  return createFsRouter(routesDir).routes.map((route) => ({
    pattern: route.pattern,
    file: relative(root, route.filePath),
    layouts: route.layouts.map((layout) => relative(root, layout)),
  }));
}

/** Everything the report needs, gathered from the app rather than asked of the reporter. */
export async function collectInfo(root: string): Promise<JanuxInfo> {
  const app = await resolveAppConfig(root);
  const own = readPackage(root);

  return {
    versions: {
      janux: readPackage(packageDir('janux', root))?.version,
      cli: readPackage(packageDir('@janux/cli', root))?.version,
      bun: Bun.version,
      os: `${process.platform} ${release()} (${process.arch})`,
    },
    app: { name: own?.name, version: own?.version },
    config: configOf(app, root),
    adapters: ADAPTERS.map((name) => presence(name, root)),
    integrations: INTEGRATIONS.map((name) => presence(name, root)),
    routes: routesOf(app.routesDir, root),
  };
}

export { renderInfoMarkdown as renderInfo };

export async function info({ root }: CliCommand): Promise<void> {
  console.log(renderInfoMarkdown(await collectInfo(root)));
}
