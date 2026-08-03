import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { createJanuxServer } from '../../packages/janux-server/src/index';
import { prodServerOptions } from '../../packages/janux-cli/src/prod';
import { publishAppRoot } from '../../packages/janux-vite/src/app-config';
import { staticResponse } from '../../packages/janux-cli/src/static-assets';

/** Driving a real browser does not fit bun's 5s default. */
export const TIMEOUT = 60_000;

const REPO_ROOT = join(import.meta.dir, '../..');

/** Repo-relative app dir ('examples/i18n', 'apps/docs') → absolute root. */
export function appRoot(name: string): string {
  return join(REPO_ROOT, name);
}

/** Whether `janux build` ran for the app — browser suites skip otherwise. */
export function isBuilt(name: string): boolean {
  return existsSync(join(appRoot(name), 'dist/client'));
}

/** In-process server for SSR-only suites: no port, no static assets. */
export async function ssrApp(name: string) {
  publishAppRoot(appRoot(name));
  const server = createJanuxServer(await prodServerOptions(appRoot(name)));
  const get = (path: string, headers: Record<string, string> = {}) =>
    server.fetch(new Request(`http://test${path}`, { headers }));

  return { server, get };
}

/**
 * Serves the built app like `janux start` does, on an auto-assigned port.
 *
 * `observe` sees every request paired with the response it got, which is how a
 * suite asserts on what the browser actually sent (see csrf.e2e.test.ts). It is
 * a hook rather than a proxy on purpose: standing a second `Bun.serve` in front
 * and awaiting a loopback `fetch` into this one starved under a loaded suite
 * and delivered empty response bodies.
 */
export async function serveBuilt(name: string, observe?: (req: Request, res: Response) => void) {
  publishAppRoot(appRoot(name));
  const app = createJanuxServer(await prodServerOptions(appRoot(name)));
  const staticDir = join(appRoot(name), 'dist/client');
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const res = (await staticResponse(staticDir, req)) ?? (await app.fetch(req));

      observe?.(req, res);

      return res;
    },
  });

  return { base: `http://localhost:${server.port}`, stop: () => server.stop(true) };
}

/** Whether `janux-node` ran for the app — the Node suites skip otherwise. */
export function hasNodeBuild(name: string): boolean {
  return existsSync(join(appRoot(name), 'build/index.js'));
}

/**
 * Serves the app the way a deployment does: `node build/index.js`, in its own
 * process, with no Bun anywhere in it.
 *
 * The other helpers run the server in *this* process, which cannot answer the
 * question this one exists for — a bundle that only works because Bun happened
 * to be the thing importing it would pass every one of them.
 */
export async function serveNode(name: string, port: number) {
  const child = Bun.spawn(['node', join(appRoot(name), 'build/index.js')], {
    cwd: appRoot(name),
    env: { ...process.env, PORT: String(port) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const base = `http://localhost:${port}`;
  const output = { text: '' };

  void (async () => {
    const decoder = new TextDecoder();

    for await (const chunk of child.stdout as ReadableStream<Uint8Array>) output.text += decoder.decode(chunk, { stream: true });
  })();

  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await fetch(base);

      return { base, output, stop: () => child.kill() };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`${name}: the node server never came up.\n${await new Response(child.stderr).text()}`);
}

export { launchBrowser } from './browser';

/** New page that records uncaught page errors for the final assertion. */
export async function openPage(browser: Browser): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));

  return { page, errors };
}
