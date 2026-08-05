import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createJanuxServer } from '@janux/server';
import {
  janux,
  publishAppRoot,
  resolveAppConfig,
  retireServiceWorker,
  serviceWorkerAssets,
  serviceWorkerVersion,
  SERVICE_WORKER_FILE,
  writeFontAssets,
  writeImageVariants,
} from '@janux/vite';
import { prodServerOptions } from './prod';
import { staticResponse } from './static-assets';
import type { FontConfig } from 'janux';
import type { CliCommand } from './args';

/** Zero-config integrations: installing @janux/tailwind IS the configuration. */
export async function loadTailwindPlugin(root: string): Promise<any | undefined> {
  try {
    const mod = await import(createRequire(join(root, 'package.json')).resolve('@janux/tailwind'));

    return mod.default();
  } catch {
    return undefined;
  }
}

type ViteMode = 'dev' | 'build';

/**
 * Sourcemaps, per mode. Dev maps everything, the framework's own frames
 * included: Vite's default `sourcemapIgnoreList` hides `node_modules`, and the
 * runtime that raised an intent failure lives there through the workspace link,
 * so the trace would stop at the app's edge. Production emits `hidden` maps —
 * `.map` files for an error tracker, with no `sourceMappingURL` appended to the
 * bundle, so the client downloads exactly what it downloaded before.
 */
function sourcemapOptions(mode: ViteMode): Record<string, unknown> {
  if (mode === 'build') return { build: { sourcemap: 'hidden' } };

  return { server: { sourcemapIgnoreList: () => false } };
}

/** Shared vite options: janux plugin, the tailwind postcss pipeline when installed, and sourcemaps. */
export async function viteOptions(root: string, mode: ViteMode): Promise<Record<string, unknown>> {
  const tailwind = await loadTailwindPlugin(root);
  const css = {
    ...(mode === 'dev' && { devSourcemap: true }),
    ...(tailwind && { postcss: { plugins: [tailwind] } }),
  };

  return { root, plugins: [janux()], css: Object.keys(css).length > 0 ? css : undefined, ...sourcemapOptions(mode) };
}

/**
 * Everything `janux dev` serves beyond the app itself. The MCP and A2A
 * endpoints are on the list because they are the URLs you hand to an external
 * client, and a URL nobody prints is a URL nobody uses.
 */
const DEV_ENDPOINTS = [
  ['app', '/'],
  ['manifest', '/_janux/manifest'],
  ['agent', '/_janux/agent'],
  ['mcp', '/_janux/mcp'],
  ['a2a', '/_janux/a2a'],
  ['card', '/.well-known/agent-card.json'],
] as const;

/** The endpoint list, URLs aligned in one column. */
export function devBanner(port: number): string {
  const label = Math.max(...DEV_ENDPOINTS.map(([name]) => name.length)) + 1;

  return DEV_ENDPOINTS.map(([name, path]) => `  → ${`${name}:`.padEnd(label)} http://localhost:${port}${path}`).join('\n');
}

export async function dev({ root, port }: CliCommand): Promise<void> {
  const { createServer } = await import('vite');
  const options = await viteOptions(root, 'dev');
  const server = await createServer({ ...options, server: { ...(options.server as object), port } });

  await server.listen();
  console.log(`\n  janux dev ready\n${devBanner(port)}\n`);
}

/**
 * The stylesheet is always a bundler input, Tailwind or not: copying it verbatim
 * shipped whatever dev resolved through Vite — `@import` of a dependency's CSS,
 * bare specifiers, url() assets — as literal text the browser can't resolve.
 */
export function bundleInputs(app: { clientEntry: string; stylesheet?: string }) {
  const input: Record<string, string> = {};

  if (app.clientEntry) input.client = app.clientEntry;
  if (app.stylesheet) input.styles = app.stylesheet;

  return input;
}

const HASHED = 'assets/[name]-[hash][extname]';

/**
 * The HTML shell links exactly one sheet, `/styles.css`, so only the app's own
 * stylesheet may claim that name — a dependency's CSS taking it would leave the
 * app's sheet emitted beside it, linked by nobody. Rollup reports where an asset
 * came from, which is what tells them apart.
 */
export function cssAssetName(root: string, stylesheet: string | undefined) {
  return (info: { names?: string[]; originalFileNames?: string[] }): string => {
    const sources = (info.originalFileNames ?? []).map((file) => resolve(root, file));

    return stylesheet && sources.includes(stylesheet) ? 'styles.css' : HASHED;
  };
}

async function bundleClient(root: string, input: Record<string, string>, stylesheet?: string): Promise<void> {
  const { build: viteBuild } = await import('vite');
  const options = await viteOptions(root, 'build');

  await viteBuild({
    ...options,
    build: {
      ...(options.build as object),
      outDir: 'dist/client',
      rollupOptions: {
        input,
        output: {
          entryFileNames: (chunk: any) => (chunk.name === 'client' ? 'client.js' : '[name].js'),
          assetFileNames: cssAssetName(root, stylesheet),
        },
      },
    },
  });
}

/**
 * The rollup half of the service-worker build, kept beside the client's.
 *
 * `iife`, not ESM: a worker registered without `{ type: 'module' }` is a
 * classic script, and a classic script cannot `import`. `inlineDynamicImports`
 * makes that true of the whole graph rather than just the entry.
 *
 * `emptyOutDir: false` is load-bearing — this build runs into a directory that
 * already holds the client bundle, and Vite's default is to clear it first.
 */
function serviceWorkerOutput(entry: string, build: object, manifest: object) {
  return {
    define: { __JANUX_SW_BUILD__: JSON.stringify(manifest) },
    build: {
      ...build,
      outDir: 'dist/client',
      emptyOutDir: false,
      rollupOptions: {
        input: entry,
        output: { format: 'iife' as const, entryFileNames: SERVICE_WORKER_FILE, inlineDynamicImports: true },
      },
    },
  };
}

/**
 * Bundles `src/sw.ts` to `dist/client/sw.js`, with the asset manifest of *this*
 * build substituted in.
 *
 * After the client bundle and the copied assets, because the list it precaches
 * is a reading of the output directory — but BEFORE the prerender, because a
 * prerendered page is a finished file and the registration script has to be
 * inside it. `output: "static"` has no server left to add it afterwards, and a
 * static site is the archetype this whole feature is worth most to. Nothing is
 * lost by the earlier position: prerendered documents are deliberately not
 * precached (they are answered network-first, see `service-worker.ts`).
 */
async function bundleServiceWorker(root: string, entry: string): Promise<void> {
  const { build: viteBuild } = await import('vite');
  const options = await viteOptions(root, 'build');
  const outDir = join(root, 'dist/client');
  const assets = serviceWorkerAssets(outDir);
  const version = serviceWorkerVersion(outDir, assets);

  await viteBuild({ ...options, ...serviceWorkerOutput(entry, options.build as object, { assets, version }) });
  console.log(`janux build: service worker (${assets.length} assets precached, build ${version}).`);
}

export async function build({ root }: Pick<CliCommand, 'root'>): Promise<void> {
  const app = await resolveAppConfig(root);
  const input = bundleInputs(app);

  if (Object.keys(input).length > 0) await bundleClient(root, input, app.stylesheet);
  else console.log('janux build: nothing to bundle — fully static app (0 KB JS).');
  await emitAssets(root, app);
  if (app.serviceWorkerEntry) await bundleServiceWorker(root, app.serviceWorkerEntry);
  else if (retireServiceWorker(join(root, 'dist/client'))) {
    console.log('janux build: removed sw.js — the app has no src/sw.ts.');
  }
  if (app.output === 'static') await prerenderStatic(root);
}

type PageServer = {
  fetch(req: Request): Promise<Response>;
  listPages(): Promise<string[]>;
  notFoundPage(): Promise<Response | undefined>;
};

async function writePage(server: PageServer, outDir: string, page: string): Promise<void> {
  const response = await server.fetch(new Request(`http://localhost${page}`));
  const dir = join(outDir, page.slice(1));

  mkdirSync(dir, { recursive: true });
  await Bun.write(join(dir, 'index.html'), await response.text());
  await writePageMarkdown(server, outDir, page);
}

/** The page's `.md` projection, at the URL a running server answers: `/posts/x` → `posts/x.md`, `/` → `.md`. */
async function writePageMarkdown(server: PageServer, outDir: string, page: string): Promise<void> {
  const response = await server.fetch(new Request(`http://localhost${page}.md`));

  if (response.status === 200) await Bun.write(join(outDir, `${page.slice(1)}.md`), await response.text());
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

/** Every concrete page (dynamic routes via `staticParams`) → `<page>/index.html` + `<page>.md` in outDir, plus `404.html`. */
export async function prerenderPages(server: PageServer, outDir: string): Promise<number> {
  const pages = await server.listPages();
  const concrete = pages.filter((page) => !page.includes('['));
  const skipped = pages.filter((page) => page.includes('['));

  skipped.forEach((page) => console.log(`janux build: skipped ${page} — dynamic route without staticParams.`));
  await Promise.all(concrete.map((page) => writePage(server, outDir, page)));
  await writeNotFound(server, outDir);

  return concrete.length;
}

/** `404.html`: the file every static host serves for a path it has nothing at. */
async function writeNotFound(server: PageServer, outDir: string): Promise<void> {
  const response = await server.notFoundPage();

  if (response) await Bun.write(join(outDir, '404.html'), await response.text());
}

/** `output: "static"`: prerenders every concrete page into dist/client. */
async function prerenderStatic(root: string): Promise<void> {
  publishAppRoot(root);
  // A build renders pages; it does not serve, so it must not run the app's
  // background jobs — see `ProdOptions`.
  const options = await prodServerOptions(root, undefined, { schedules: false });
  const server = createJanuxServer({ ...options, staticExport: true });
  const outDir = join(root, 'dist/client');
  const count = await prerenderPages(server, outDir);

  await writeGeneratedFiles(server, outDir);
  if (options.i18n) await Bun.write(join(outDir, 'index.html'), localeRedirectStub(options.i18n.locales, options.i18n.defaultLocale));
  console.log(`janux build: prerendered ${count} pages (output: static).`);
}

/**
 * Files the server generates rather than routes: a static host has no server to
 * ask, so the build asks for it. Each is opt-in server-side (`llmsTxt`,
 * `siteUrl`), and a 404 simply means the app didn't ask for it.
 */
const GENERATED_FILES = ['llms.txt', 'sitemap.xml', 'robots.txt', 'rss.xml'];

async function writeGeneratedFiles(
  server: { fetch(req: Request): Promise<Response> },
  outDir: string,
): Promise<void> {
  await Promise.all(
    GENERATED_FILES.map(async (file) => {
      const response = await server.fetch(new Request(`http://localhost/${file}`));

      if (response.status === 200) await Bun.write(join(outDir, file), await response.text());
    }),
  );
}

function copyPublicDir(root: string): void {
  const publicDir = join(root, 'public');

  if (!existsSync(publicDir)) return;
  cpSync(publicDir, join(root, 'dist/client'), { recursive: true });
}

/**
 * The client assets that are not the bundle: `public/` verbatim, every
 * `<Image>` variant derived from it, and the self-hosted fonts the app
 * declared. Both outputs get them at build time — `output: "static"` has no
 * server left to produce anything, and `janux start` should serve bytes rather
 * than make them.
 */
export async function emitAssets(root: string, app: { fonts: FontConfig[] }): Promise<void> {
  copyPublicDir(root);
  const outDir = join(root, 'dist/client');
  const [images, fonts] = await Promise.all([writeImageVariants(root, outDir), writeFontAssets(root, app.fonts, outDir)]);

  if (images > 0) console.log(`janux build: optimized ${images} image${images === 1 ? '' : 's'} (avif + webp).`);
  if (fonts > 0) console.log(`janux build: self-hosted ${fonts} font${fonts === 1 ? '' : 's'} (subset + adjusted fallback).`);
}

export async function start({ root, port }: CliCommand): Promise<void> {
  publishAppRoot(root);
  const options = await prodServerOptions(root);
  const server = createJanuxServer(options);
  const staticDir = join(root, 'dist/client');

  // `serve` (not `fetch`) so a request on `websocket.path` upgrades; the
  // handlers come from the same server, so `janux start` needs no custom server.
  Bun.serve({
    port,
    fetch: async (req, bun) => (await staticResponse(staticDir, req)) ?? server.serve(req, bun),
    websocket: server.websocket,
  });
  console.log(`janux start: production server on http://localhost:${port}/ (Bun)`);
}
