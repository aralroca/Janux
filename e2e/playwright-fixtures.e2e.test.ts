import { describe, expect, it } from 'bun:test';
import { isBuilt } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

const SHOP = appRoot('examples/shop');

/**
 * The `@janux/testing/playwright` fixtures cannot run under bun:test — they
 * belong to the Playwright runner. So this suite spawns the real runner on the
 * committed specs in support/playwright-fixture/ and asserts the whole story:
 * worker-scoped server, settled-based goto, quiet-by-construction 0-JS pages.
 */
describe.if(isBuilt(SHOP))('@janux/testing/playwright fixtures', () => {
  it(
    'passes a real playwright suite against the built shop',
    async () => {
      const child = Bun.spawn(
        ['bunx', 'playwright', 'test', '--config', 'e2e/support/playwright-fixture/playwright.config.ts'],
        {
          cwd: appRoot('.'),
          env: { ...process.env, JANUX_SHOP_ROOT: SHOP },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const code = await child.exited;
      const output = (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());

      expect(output).toContain('2 passed');
      expect(code).toBe(0);
    },
    TIMEOUT,
  );
});
