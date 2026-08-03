import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { prodServerOptions } from '../packages/janux-cli/src/prod';
import { staticResponse } from '../packages/janux-cli/src/static-assets';
import { isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * examples/shop declares `csp: true` and nothing else, so this suite is the
 * claim that one line makes: a real Chrome, the real header, zero violations.
 *
 * Two moments matter and only one is obvious. A fresh load proves the shell and
 * the renderer nonce what they emit. An SPA navigation proves the harder half:
 * every response carries a DIFFERENT nonce, and the policy governing the live
 * document is the one that arrived with the first — so a runtime that replays a
 * navigated page's scripts under the incoming nonce breaks here and only here.
 *
 * The must-fail canary is what makes the zeros mean something: a policy that
 * blocks nothing also reports nothing.
 */

const BUILT = isBuilt(appRoot('examples/shop'));
const SUSPENSE_BUILT = isBuilt(appRoot('examples/with-suspense'));

let BASE = '';
let SUSPENSE_BASE = '';
let stop: (() => void) | undefined;
let stopSuspense: (() => void) | undefined;
let browser: Browser | undefined;

/**
 * examples/with-suspense does NOT declare `csp` — it exists to demo streaming,
 * not security — so the option is applied here instead. Boundaries are the one
 * place a strict policy fails silently rather than loudly: the swap call is an
 * inline script, and a refused one leaves the skeleton on screen forever.
 */
async function serveWithCsp(name: string) {
  const app = createJanuxServer({ ...(await prodServerOptions(appRoot(name))), csp: true });
  const staticDir = join(appRoot(name), 'dist/client');
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => (await staticResponse(staticDir, req)) ?? app.fetch(req),
  });

  return { base: `http://localhost:${server.port}`, stop: () => server.stop(true) };
}

beforeAll(async () => {
  browser = BUILT || SUSPENSE_BUILT ? await launchBrowser() : undefined;
  if (BUILT) ({ url: BASE, stop } = await startTestServer(appRoot('examples/shop')));
  if (SUSPENSE_BUILT) ({ base: SUSPENSE_BASE, stop: stopSuspense } = await serveWithCsp('examples/with-suspense'));
});

afterAll(() => {
  stop?.();
  stopSuspense?.();
});

/** Records violations the way an app would: the DOM event, from the first byte. */
async function watch(): Promise<{ page: Page; errors: string[]; violations: () => Promise<string[]> }> {
  const { page, errors } = await openPage(browser!);

  await page.addInitScript(() => {
    (window as any).__csp = [];
    addEventListener('securitypolicyviolation', (event) => {
      (window as any).__csp.push(`${event.violatedDirective} :: ${event.blockedURI}`);
    });
  });

  return { page, errors, violations: () => page.evaluate(() => (window as any).__csp as string[]) };
}

const CART_ITEMS = 'janux-island[data-jx^="cart#"] li';

const cartCount = (page: Page) => page.locator(CART_ITEMS).count();

/** Adds one item and waits for the island to re-render — a blocked runtime hangs here. */
async function addToCart(page: Page): Promise<void> {
  const expected = (await cartCount(page)) + 1;

  await page.locator('button:has-text("Add to cart")').first().click();
  await page.waitForFunction(
    ([selector, count]) => document.querySelectorAll(selector as string).length === count,
    [CART_ITEMS, expected] as const,
    { timeout: 10_000 },
  );
}

describe.if(BUILT)('examples/shop under a strict CSP', () => {
  it(
    'serves a policy with a nonce and no escape hatch',
    async () => {
      const { page } = await watch();
      const response = await page.goto(`${BASE}/shop`);
      const policy = response!.headers()['content-security-policy']!;

      expect(policy).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
      expect(policy).not.toContain('unsafe-inline');
      expect(policy).not.toContain('unsafe-eval');
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'boots and stays interactive on a fresh load, with zero violations',
    async () => {
      const { page, errors, violations } = await watch();

      await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
      expect(await page.evaluate(() => typeof (window as any).janux?.call === 'function')).toBe(true);
      await addToCart(page);

      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );

  /**
   * The nonce changes per response; the document's policy does not. The round
   * trip leaves and returns, so the cart island is mounted against markup that
   * arrived with a nonce this document would refuse if the runtime replayed it.
   */
  it(
    'stays interactive after an SPA navigation, with zero violations',
    async () => {
      const { page, errors, violations } = await watch();

      await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
      await page.evaluate(() => ((window as any).__sameDocument = true));
      await page.evaluate(() => (window as any).janux.navigate('/'));
      await page.waitForSelector('a[href="/shop"]');
      await page.evaluate(() => (window as any).janux.navigate('/shop'));
      await page.waitForSelector('janux-island[data-jx^="cart#"]');
      // A full reload would have wiped the marker: this really was the diff.
      expect(await page.evaluate(() => (window as any).__sameDocument === true)).toBe(true);
      await addToCart(page);

      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );

  /**
   * The navigation half of the canary, and the one that actually bit: the
   * runtime re-creates the scripts a navigated page brings, and re-creating a
   * script is what decides whether it gets a valid nonce. Stamping every
   * incoming script would launder an injected one into an executed one — a
   * strict CSP that stops the payload on a fresh load and waves it through on
   * an SPA navigation is worse than none, because the report says "protected".
   */
  it(
    'refuses an inline script injected into a NAVIGATED page',
    async () => {
      const { page, violations } = await watch();

      await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
      await page.route(`${BASE}/`, async (route) => {
        const served = await route.fetch();
        const body = (await served.text()).replace('<body>', '<body><script>window.__pwned=true</script>');

        await route.fulfill({ response: served, body });
      });
      await page.evaluate(() => (window as any).janux.navigate('/'));
      await page.waitForSelector('a[href="/shop"]');

      expect(await page.evaluate(() => (window as any).__pwned ?? false)).toBe(false);
      // The navigation itself still succeeded: the injection was dropped, not the page.
      expect(await page.evaluate(() => location.pathname)).toBe('/');
      expect(await violations()).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );

  /** Red must be reachable, or the two zeros above prove nothing. */
  it(
    'refuses an inline script injected into the served markup',
    async () => {
      const { page, violations } = await watch();

      await page.route('**/shop', async (route) => {
        const served = await route.fetch();
        const body = (await served.text()).replace('<body>', '<body><script>window.__pwned=true</script>');

        await route.fulfill({ response: served, body });
      });
      await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });

      expect(await page.evaluate(() => (window as any).__pwned ?? false)).toBe(false);
      expect(await violations()).not.toEqual([]);
      // And the app itself is unharmed: the policy blocked the injection, not the page.
      expect(await page.evaluate(() => typeof (window as any).janux?.call === 'function')).toBe(true);
      await page.close();
    },
    TIMEOUT,
  );
});

describe.if(SUSPENSE_BUILT)('streaming suspense under a strict CSP', () => {
  /**
   * The renderer's own inline scripts: `self.jx$u=…` and one `jx$u(key)` call
   * per boundary. Unnonced, Chrome refuses them and the skeleton never swaps —
   * a page that looks like it is merely slow.
   */
  it(
    'reveals every boundary, with zero violations',
    async () => {
      const { page, violations } = await watch();

      await page.goto(`${SUSPENSE_BASE}/dashboard`);
      await page.waitForSelector('.stat-value:has-text("4.2k€")', { timeout: 15_000 });
      expect(await page.locator('janux-island[data-jx-pending]').count()).toBe(0);
      expect(await violations()).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});
