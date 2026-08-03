import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * Streaming suspense in a real browser, against the built with-suspense
 * example. The delays are real (the example's sources sleep on purpose), so no
 * slow proxy is needed: mid-stream states are observable directly. What only an
 * engine can verify: the skeleton painting while the response is still open,
 * the swap running during a streamed navigation diff, and the swap running
 * AGAIN on a second visit — the call scripts self-remove precisely so the diff
 * re-executes them instead of morphing them in place.
 */

const APP = appRoot('examples/with-suspense');
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const pendingCount = (page: Page) => page.locator('janux-island[data-jx-pending]').count();

/**
 * Records, inside the page and under `key`, how many boundaries were still
 * pending the instant `selector` first read `text`.
 *
 * Counting from here instead races the ~1s gap between the two boundaries:
 * stats swaps at ~1.5s and news at ~2.5s, and on a loaded runner the round
 * trip lands after both, so a reveal in sequence reads as one reveal at the
 * end of the stream. The moment has to be caught where it happens.
 */
const watchPending = (page: Page, key: string, selector: string, text: string) =>
  page.evaluate(
    ([name, css, needle]) => {
      const record = () => {
        const found = [...document.querySelectorAll(css!)].some((node) => node.textContent?.includes(needle!));

        if (found) (window as any)[name!] ??= document.querySelectorAll('janux-island[data-jx-pending]').length;

        return found;
      };
      const observer = new MutationObserver(() => record() && observer.disconnect());

      if (!record()) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    },
    [key, selector, text] as const,
  );

/** The count `watchPending` recorded, once it has one. */
async function pendingAt(page: Page, key: string): Promise<number> {
  await page.waitForFunction((name) => (window as any)[name] !== undefined, key, { timeout: 10_000 });

  return page.evaluate((name) => (window as any)[name], key);
}
const swapped = (page: Page) =>
  page.waitForFunction(() => !document.querySelector('[data-jx-pending]'), null, { timeout: 10_000 });

describe.skipIf(!BUILT)('streaming suspense (examples/with-suspense)', () => {
  it('first load: skeletons paint mid-stream, each boundary swaps on its own', async () => {
    const { page, errors } = await openPage();
    const navigation = page.goto(`${BASE}/dashboard`, { waitUntil: 'commit' });

    // Mid-stream: the response is still open (news needs ~2.5s), yet the page
    // painted with both fallbacks in place.
    await page.waitForSelector('janux-island[data-jx-pending]', { timeout: 5_000 });
    await watchPending(page, '__atStats', '.stat-value', '4.2k€');
    await watchPending(page, '__atClick', '.counter', 'clicks: 1');
    expect(await page.locator('.skeleton').count()).toBeGreaterThan(0);

    // The page is interactive WHILE a boundary is still pending: the runtime
    // ships in the interlude, before the trailing chunks, and the counter
    // island mounts and reacts with the stream still open. Clicked before
    // waiting on anything else, so the interaction is not squeezed into the
    // ~1s between the two boundaries resolving.
    //
    // A real mouse click, placed by hand rather than via `page.click()`: under
    // Playwright's WebKit the high-level click does not deliver until the
    // document finishes loading (~2.5s here, measured), which is *after* the
    // boundary this case needs to still be pending. The engine itself accepts
    // input on a streaming document exactly like Chromium does.
    const counter = (await page.locator('.counter').boundingBox())!;

    await page.mouse.click(counter.x + counter.width / 2, counter.y + counter.height / 2);

    // Greater than zero, not an exact count: the claim is that the click was
    // answered with the response still open, and how many boundaries were left
    // at that instant depends on where in the stream it landed.
    expect(await pendingAt(page, '__atClick')).toBeGreaterThan(0);
    // Stats (~1.5s) swap while news (~2.5s) is still pending: independent boundaries.
    expect(await pendingAt(page, '__atStats')).toBe(1);

    await navigation;
    await swapped(page);
    expect(await page.locator('.news li').allTextContents()).toContain('Streaming SSR shipped');
    // The swap machinery cleans itself out of the final DOM.
    expect(await page.locator('template[id^="jxu:"]').count()).toBe(0);
    expect(await page.locator('script[data-jxu-run]').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('SPA navigation: fallbacks show, boundaries reveal one by one, mid-stream state survives', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.click('a[href="/dashboard"]');
    await page.waitForSelector('janux-island[data-jx-pending]', { timeout: 5_000 });
    await watchPending(page, '__atNavStats', '.stat-value', '4.2k€');

    // Interacting while the page still streams: the island mounts mid-diff.
    // Placed by hand for the same reason as the first-load case above.
    const counter = (await page.locator('.counter').boundingBox())!;

    await page.mouse.click(counter.x + counter.width / 2, counter.y + counter.height / 2);
    await page.waitForFunction(
      () => document.querySelector('.counter')?.textContent?.includes('clicks: 1'),
      null,
      { timeout: 5_000 },
    );

    // Boundaries reveal in sequence DURING the diff, not all at stream end:
    // stats (~1.5s) swaps while news (~2.5s) is provably still pending — the
    // sentinel after each chunk is what releases it from the walker's hold.
    expect(await pendingAt(page, '__atNavStats')).toBe(1);

    await swapped(page);
    // Same document throughout: it was a diff, not a load.
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
    // The swap mutates <body> while the streaming diff walks it: the shell
    // pieces around the boundary chunks must survive.
    expect(await page.locator('script[type="application/janux+state"]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => Object.keys((window as any).__JANUX_ISLANDS__ ?? {}).length)).toBeGreaterThan(0);

    // The post-navigation sweep keeps what the user built mid-stream: the
    // counter continues from 1, it does not reset to the incoming snapshot.
    await page.click('.counter');
    await page.waitForFunction(
      () => document.querySelector('.counter')?.textContent?.includes('clicks: 2'),
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('navigating away sweeps the old page as soon as the new one paints', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/broken`);
    await page.waitForSelector('.card-error');
    await page.click('a[href="/dashboard"]');

    // The interlude right after the page's own HTML proves the body complete
    // to the streaming diff, so the old error cards are gone the moment the
    // skeletons show — not after the slowest boundary resolves.
    await page.waitForSelector('janux-island[data-jx-pending]', { timeout: 5_000 });
    expect(await page.locator('.card-error').count()).toBe(0);

    await swapped(page);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('a second visit swaps again: call scripts re-execute instead of morphing', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/dashboard`);
    await swapped(page);
    await page.click('a[href="/"]');
    await page.waitForSelector('h1:has-text("Streaming suspense")');

    await page.click('a[href="/dashboard"]');
    await page.waitForSelector('janux-island[data-jx-pending]', { timeout: 5_000 });
    await swapped(page);
    expect(await page.locator('.stat-value:has-text("4.2k€")').count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('error boundaries: both error views render and the page stays interactive', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/broken`);
    await page.waitForSelector('.card-error');

    expect(await page.locator('.card-error').count()).toBe(2);
    const body = await page.textContent('body');

    expect(body).toContain('the card data was corrupt');
    expect(body).toContain('leaf exploded');
    expect(body).not.toContain('Shell content');

    const before = await page.locator('.counter').textContent();

    await page.click('.counter');
    // Polling, not a one-shot read: the click mounts the island lazily
    // (a dynamic import over HTTP) before the state can change.
    await page.waitForFunction(
      (previous) => document.querySelector('.counter')?.textContent !== previous,
      before,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
