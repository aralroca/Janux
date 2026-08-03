import { test as base, type Page } from 'playwright/test';
import { gotoSettled, settled as settledBarrier } from './browser';
import { startTestServer, type TestServer } from './test-server';

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
      const server = await startTestServer(janux.root);

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
