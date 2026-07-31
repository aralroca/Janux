import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createJanuxServer } from '../../packages/janux-server/src/index';
import { prodServerOptions } from '../../packages/janux-cli/src/prod';
import { publishAppRoot } from '../../packages/janux-vite/src/app-config';
import { staticResponse } from '../../packages/janux-cli/src/static-assets';

/** Driving a real Chrome does not fit bun's 5s default. */
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

let sharedChrome: Promise<Browser> | undefined;

/**
 * One Chrome for the whole test process. Launch/teardown churn across a dozen
 * suites is what made goto() flake under load; suites must NOT close this —
 * pages yes, the browser dies with the process.
 */
export function launchChrome(): Promise<Browser> {
  sharedChrome ??= chromium.launch({ channel: 'chrome' });

  return sharedChrome;
}

/** New page that records uncaught page errors for the final assertion. */
export async function openPage(browser: Browser): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));

  return { page, errors };
}
