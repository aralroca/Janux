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

/** bun-types leaves the EventEmitter half off `ChildProcess`; this is the slice used here. */
type Spawned = ChildProcess & { on(event: 'error', listener: (error: Error) => void): void };

/** Sibling of this module, whichever extension the package is running from (src in the repo, dist when published). */
const SERVE_ENTRY = fileURLToPath(new URL(import.meta.url.replace(/playwright(\.[jt]s)$/, 'serve$1')));

/**
 * The app runs in its own Bun process, not in this one: the Playwright runner
 * is Node, and a Janux server is Bun-first. `serve.ts` prints its URL, which is
 * also the readiness signal.
 */
async function spawnServer(root: string): Promise<TestServer> {
  // The listener is not optional: an 'error' event with none — `bun` missing —
  // is an uncaught exception that takes the worker down before the message
  // below can explain why.
  const child = spawn('bun', [SERVE_ENTRY, root], { stdio: ['ignore', 'pipe', 'inherit'] }) as Spawned;
  const stop = () => {
    child.kill();
  };

  child.on('error', stop);

  return { url: await serverUrl(child.stdout, root).catch((error) => (stop(), Promise.reject(error))), stop };
}

/**
 * The app's own stdout shares this pipe — `src/instrumentation.ts` and anything
 * it loads print before the server answers — so the URL is recognised by shape
 * rather than by being first. No URL at all means `bun` never ran the server.
 */
async function serverUrl(stdout: Readable | null, root: string): Promise<string> {
  for await (const chunk of stdout ?? []) {
    const url = String(chunk)
      .split('\n')
      .find((line) => /^https?:\/\//.test(line.trim()));

    if (url) return url.trim();
  }

  throw new Error(`@janux/testing/playwright: could not serve ${root} — is \`bun\` on PATH?`);
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
