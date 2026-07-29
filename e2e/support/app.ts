import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createJanuxServer } from '../../packages/janux-server/src/index';
import { prodServerOptions } from '../../packages/janux-cli/src/prod';
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
  const server = createJanuxServer(await prodServerOptions(appRoot(name)));
  const get = (path: string, headers: Record<string, string> = {}) =>
    server.fetch(new Request(`http://test${path}`, { headers }));

  return { server, get };
}

/** Serves the built app like `janux start` does, on an auto-assigned port. */
export async function serveBuilt(name: string) {
  const app = createJanuxServer(await prodServerOptions(appRoot(name)));
  const staticDir = join(appRoot(name), 'dist/client');
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => (await staticResponse(staticDir, req)) ?? app.fetch(req),
  });

  return { base: `http://localhost:${server.port}`, stop: () => server.stop(true) };
}

export function launchChrome(): Promise<Browser> {
  return chromium.launch({ channel: 'chrome' });
}

/** New page that records uncaught page errors for the final assertion. */
export async function openPage(browser: Browser): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));

  return { page, errors };
}
