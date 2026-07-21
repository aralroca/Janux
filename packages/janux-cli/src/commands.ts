import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createJanuxServer, type ServerOptions } from '@janux/server';
import { defineAgent } from '@janux/agent';
import { apiFiles, apiModuleName, janux, resolveAppConfig } from '@janux/vite';
import type { CliCommand } from './args';

export async function dev({ root, port }: CliCommand): Promise<void> {
  const { createServer } = await import('vite');
  const server = await createServer({ root, plugins: [janux()], server: { port } });

  await server.listen();
  console.log(`\n  janux dev ready\n  → app:      http://localhost:${port}/`);
  console.log(`  → manifest: http://localhost:${port}/_janux/manifest`);
  console.log(`  → agent:    http://localhost:${port}/_janux/agent\n`);
}

export async function build({ root }: CliCommand): Promise<void> {
  const app = resolveAppConfig(root);

  if (app.clientEntry) {
    const { build: viteBuild } = await import('vite');

    await viteBuild({
      root,
      plugins: [janux()],
      build: {
        outDir: 'dist/client',
        rollupOptions: { input: app.clientEntry, output: { entryFileNames: 'client.js' } },
      },
    });
  } else {
    console.log('janux build: no src/client.ts — fully static app, nothing to bundle (0 KB JS).');
  }
  copyStylesheet(app.stylesheet, root);
  copyPublicDir(root);
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

async function prodServerOptions(root: string): Promise<ServerOptions> {
  const app = resolveAppConfig(root);
  const apiModules = Object.fromEntries(
    await Promise.all(
      apiFiles(app.serverDir).map(async (file) => [apiModuleName(file), await import(file)]),
    ),
  );
  const agentModule = app.agentModule ? await import(app.agentModule) : undefined;
  const storesModule = app.storesModule ? await import(app.storesModule) : undefined;

  return {
    routesDir: app.routesDir,
    apis: apiModules,
    agent: agentModule?.default ?? defineAgent(),
    storeDefs: storesModule ?? {},
    runtimeUrl: existsSync(join(root, 'dist/client/client.js')) ? '/client.js' : undefined,
    stylesheets: app.stylesheet ? ['/styles.css'] : [],
    title: app.title,
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
