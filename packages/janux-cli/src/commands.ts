import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createJanuxServer, type ServerOptions } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { apiFiles, apiModuleName, janux, resolveAppConfig } from '@janux/vite';
import type { CliCommand } from './args';

/** Zero-config integrations: installing @janux/tailwind IS the configuration. */
export async function loadTailwindPlugin(root: string): Promise<any | undefined> {
  try {
    const mod = await import(Bun.resolveSync('@janux/tailwind', root));

    return mod.default();
  } catch {
    return undefined;
  }
}

/** Shared vite options: janux plugin + the tailwind postcss pipeline when installed. */
async function viteOptions(root: string): Promise<Record<string, unknown>> {
  const tailwind = await loadTailwindPlugin(root);

  return {
    root,
    plugins: [janux()],
    css: tailwind ? { postcss: { plugins: [tailwind] } } : undefined,
  };
}

export async function dev({ root, port }: CliCommand): Promise<void> {
  const { createServer } = await import('vite');
  const server = await createServer({ ...(await viteOptions(root)), server: { port } });

  await server.listen();
  console.log(`\n  janux dev ready\n  → app:      http://localhost:${port}/`);
  console.log(`  → manifest: http://localhost:${port}/_janux/manifest`);
  console.log(`  → agent:    http://localhost:${port}/_janux/agent\n`);
}

function bundleInputs(app: { clientEntry: string; stylesheet?: string }, tailwind: boolean) {
  const input: Record<string, string> = {};

  if (app.clientEntry) input.client = app.clientEntry;
  if (tailwind && app.stylesheet) input.styles = app.stylesheet;

  return input;
}

function cssAsStyles(info: any): string {
  const name = info.names?.[0] ?? info.name ?? '';

  return name.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]';
}

async function bundleClient(root: string, input: Record<string, string>): Promise<void> {
  const { build: viteBuild } = await import('vite');

  await viteBuild({
    ...(await viteOptions(root)),
    build: {
      outDir: 'dist/client',
      rollupOptions: {
        input,
        output: {
          entryFileNames: (chunk: any) => (chunk.name === 'client' ? 'client.js' : '[name].js'),
          assetFileNames: cssAsStyles,
        },
      },
    },
  });
}

export async function build({ root }: CliCommand): Promise<void> {
  const app = await resolveAppConfig(root);
  const tailwind = await loadTailwindPlugin(root);
  const input = bundleInputs(app, tailwind !== undefined);

  if (Object.keys(input).length > 0) await bundleClient(root, input);
  else console.log('janux build: nothing to bundle — fully static app (0 KB JS).');
  if (tailwind === undefined) copyStylesheet(app.stylesheet, root);
  copyPublicDir(root);
  if (app.output === 'static') await prerenderStatic(root);
}

async function writePage(server: { fetch(req: Request): Promise<Response> }, outDir: string, page: string): Promise<void> {
  const response = await server.fetch(new Request(`http://localhost${page}`));
  const dir = join(outDir, page.slice(1));

  mkdirSync(dir, { recursive: true });
  await Bun.write(join(dir, 'index.html'), await response.text());
}

/** No-JS fallback is the meta refresh; with JS the stub matches the visitor's languages against the app's locales. */
export function localeRedirectStub(locales: string[], defaultLocale: string): string {
  const script =
    `var locales=${JSON.stringify(locales)};` +
    `var tags=(navigator.languages||[navigator.language||'']).map(function(l){return l.toLowerCase()});` +
    `var match=tags.map(function(tag){return locales.find(function(l){var b=tag.split('-')[0];l=l.toLowerCase();return l===tag||l===b||l.indexOf(b+'-')===0})})` +
    `.filter(Boolean)[0];` +
    `location.replace('/'+(match||${JSON.stringify(defaultLocale)}))`;

  return [
    '<!doctype html>',
    `<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="1; url=/${defaultLocale}">`,
    `<script>${script}</script></head><body></body></html>`,
  ].join('');
}

/** `output: "static"`: prerenders every concrete page (dynamic routes via `staticParams`) into dist/client. */
async function prerenderStatic(root: string): Promise<void> {
  const options = await prodServerOptions(root);
  const server = createJanuxServer(options);
  const pages = await server.listPages();
  const outDir = join(root, 'dist/client');
  const concrete = pages.filter((page) => !page.includes('['));
  const skipped = pages.filter((page) => page.includes('['));

  skipped.forEach((page) => console.log(`janux build: skipped ${page} — dynamic route without staticParams.`));
  await Promise.all(concrete.map((page) => writePage(server, outDir, page)));
  await writeLlmsTxt(server, outDir);
  if (options.i18n) await Bun.write(join(outDir, 'index.html'), localeRedirectStub(options.i18n.locales, options.i18n.defaultLocale));
  console.log(`janux build: prerendered ${concrete.length} pages (output: static).`);
}

async function writeLlmsTxt(server: { fetch(req: Request): Promise<Response> }, outDir: string): Promise<void> {
  const response = await server.fetch(new Request('http://localhost/llms.txt'));

  if (response.status === 200) await Bun.write(join(outDir, 'llms.txt'), await response.text());
}

function copyStylesheet(stylesheet: string | undefined, root: string): void {
  if (!stylesheet) return;
  const outDir = join(root, 'dist/client');

  mkdirSync(outDir, { recursive: true });
  cpSync(stylesheet, join(outDir, 'styles.css'));
}

function copyPublicDir(root: string): void {
  const publicDir = join(root, 'public');

  if (!existsSync(publicDir)) return;
  cpSync(publicDir, join(root, 'dist/client'), { recursive: true });
}

export async function prodServerOptions(root: string): Promise<ServerOptions> {
  const app = await resolveAppConfig(root);
  const apiModules = Object.fromEntries(
    await Promise.all(
      apiFiles(app.serverDir).map(async (file) => [apiModuleName(file), await import(file)]),
    ),
  );
  const agentModule = app.agentModule ? await import(app.agentModule) : undefined;
  const storesModule = app.storesModule ? await import(app.storesModule) : undefined;
  const i18nModule = app.i18nModule ? await import(app.i18nModule) : undefined;

  return {
    routesDir: app.routesDir,
    apis: apiModules,
    agent: agentModule?.default ?? defineAgent(),
    storeDefs: storesModule ?? {},
    runtimeUrl: existsSync(join(root, 'dist/client/client.js')) ? '/client.js' : undefined,
    stylesheets: app.stylesheet ? ['/styles.css'] : [],
    title: app.title,
    llmsTxt: app.llmsTxt,
    i18n: i18nModule?.default,
    // Foreign runtime (react) resolved from the app root — see @janux/vite.
    foreignImport: (spec) => import(createRequire(join(root, 'package.json')).resolve(spec)),
  };
}

export async function start({ root, port }: CliCommand): Promise<void> {
  const options = await prodServerOptions(root);
  const server = createJanuxServer(options);
  const staticDir = join(root, 'dist/client');

  Bun.serve({
    port,
    fetch: async (req) => {
      const { pathname } = new URL(req.url);
      const staticFile = Bun.file(join(staticDir, pathname.slice(1)));

      if (pathname !== '/' && (await staticFile.exists())) return new Response(staticFile);

      return server.fetch(req);
    },
  });
  console.log(`janux start: production server on http://localhost:${port}/ (Bun)`);
}
