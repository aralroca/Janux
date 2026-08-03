import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test as base, type Page } from 'playwright/test';
import { gotoSettled, settled as settledBarrier } from './browser';
import type { TestServer } from './test-server';

export interface JanuxOptions {
  /** Absolute root of the built app the worker serves — set it with `test.use({ janux: { root } })`. */
  root?: string;
}

/** Drives the page's agent surface the way a real agent does — through `window.janux`. */
export interface AgentDriver {
  call(tool: string, input?: unknown): Promise<unknown>;
  approve(id: string): Promise<unknown>;
  reject(id: string): Promise<unknown>;
}

interface JanuxFixtures {
  goto: (path: string) => Promise<void>;
  settled: () => Promise<void>;
  agent: AgentDriver;
}

interface JanuxWorkerFixtures {
  janux: JanuxOptions;
  app: TestServer;
}

/** Sibling of this module, whichever extension the package is running from (src in the repo, dist when published). */
const SERVE_ENTRY = fileURLToPath(new URL(import.meta.url.replace(/playwright(\.[jt]s)$/, 'serve$1')));

/**
 * The app runs in its own Bun process, not in this one: the Playwright runner
 * is Node, and a Janux server is Bun-first. `serve.ts` prints its URL on the
 * first line of stdout, which is also the readiness signal.
 */
function spawnServer(root: string): Promise<TestServer> {
  const child: ChildProcess = spawn('bun', [SERVE_ENTRY, root], { stdio: ['ignore', 'pipe', 'inherit'] });

  return firstLine(child.stdout).then((url) => ({ url, stop: () => { child.kill(); } }));
}

/** The server announces itself with its URL; no line at all means `bun` never ran it. */
async function firstLine(stream: Readable | null): Promise<string> {
  for await (const chunk of stream ?? []) return String(chunk).trim();

  throw new Error('@janux/testing/playwright: could not start the app — is `bun` on PATH?');
}

function agentDriver(page: Page): AgentDriver {
  return {
    call: (tool, input) =>
      page.evaluate(([name, arg]) => (window as any).janux.call(name, arg), [tool, input] as [string, unknown]),
    approve: (id) => page.evaluate((x) => (window as any).janux.approve(x), id),
    reject: (id) => page.evaluate((x) => (window as any).janux.reject(x), id),
  };
}

/**
 * Playwright fixtures for a built Janux app: one server per worker, `baseURL`
 * pointed at it, and a `goto` that resolves only when the page is *quiet* —
 * `janux.settled()` instead of a guessed `waitForTimeout`.
 */
export const test = base.extend<JanuxFixtures, JanuxWorkerFixtures>({
  janux: [{}, { option: true, scope: 'worker' }],
  app: [
    async ({ janux }, use) => {
      if (!janux.root) throw new Error('@janux/testing/playwright: set test.use({ janux: { root } }) to the app root');
      const server = await spawnServer(janux.root);

      await use(server);
      server.stop();
    },
    { scope: 'worker' },
  ],
  baseURL: ({ app }, use) => use(app.url),
  goto: ({ page, app }, use) => use((path) => gotoSettled(page, `${app.url}${path}`)),
  settled: ({ page }, use) => use(() => settledBarrier(page)),
  agent: ({ page }, use) => use(agentDriver(page)),
});

export { expect } from 'playwright/test';
