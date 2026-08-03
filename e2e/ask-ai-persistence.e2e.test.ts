import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, serveBuilt } from './support/app';

/**
 * The Ask AI panel is a `persist` island: opening it and touring the menu must
 * never lose it. Both regressions here were found by touring with the panel
 * open — a route that forgot to render the island (/playground, before the
 * layout owned it), and a click on the current page's own menu item, which the
 * router declined to intercept and the browser answered with a full reload.
 * Neither is observable in happy-dom: one needs real navigations, the other a
 * browser that actually performs the default action of an uncancelled click.
 */

const APP = 'apps/docs';
const BUILT = isBuilt(APP);
const DOCS_PAGE = '/docs/getting-started/what-is-janux';
const OTHER_DOCS_PAGE = '/docs/getting-started/quick-start';

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  // Chrome proper: the Navigation API drives both behaviors under test.
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

async function openDocsWithAssistant(): Promise<{ page: Page; warnings: string[] }> {
  const page = await browser!.newPage();
  const warnings: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`${BASE}${DOCS_PAGE}`, { waitUntil: 'networkidle' });
  await page.locator('.copilot-toggle').click();
  await page.waitForSelector('janux-island[data-jx-persist] input');
  // Tag the live node: proving the SAME element survived is the whole point —
  // a re-rendered copy would look identical and be a different instance.
  await page.evaluate(() => {
    (document.querySelector('janux-island[data-jx-persist]') as any).__probe = 'live';
  });

  return { page, warnings };
}

const assistantState = (page: Page) =>
  page.evaluate(() => {
    const node = document.querySelector('janux-island[data-jx-persist]') as any;

    return {
      exists: !!node,
      sameInstance: node?.__probe === 'live',
      open: !!node?.querySelector('input[name="text"]'),
    };
  });

/** The sidebar renders twice (a mobile `details` and the desktop nav); only one is clickable. */
const visibleLink = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first();

/**
 * `intercept()` commits the URL before the new document renders, so a wait on
 * the pathname alone is satisfied by the *old* page — and the assertion that
 * follows lands in the window where the persisted island has been lifted out
 * and not yet grafted back. Every engine has that window; Firefox's is wide
 * enough to lose the race routinely. `janux.settled()` drains the navigation
 * the framework itself is tracking, which is the real completion signal.
 */
const settled = async (page: Page, path: string) => {
  await page.waitForFunction((expected) => location.pathname === expected, path);
  await page.evaluate(() => (window as any).janux.settled());
};

describe.skipIf(!BUILT)('Ask AI persistence across the docs menu (apps/docs)', () => {
  it('survives a round trip through /playground with the panel open', async () => {
    const { page, warnings } = await openDocsWithAssistant();

    await visibleLink(page, '/playground').click();
    await settled(page, '/playground');

    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });

    await visibleLink(page, OTHER_DOCS_PAGE).click();
    await settled(page, OTHER_DOCS_PAGE);

    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    expect(warnings.filter((text) => text.includes('persisted island'))).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('treats a click on the current page’s own menu item as a no-op, not a reload', async () => {
    const { page } = await openDocsWithAssistant();

    await page.evaluate(() => {
      (window as any).__sameDocument = true;
    });
    // By hand again, and for a different reason than the streaming suite:
    // `locator.click()` waits for "scheduled navigations to finish", and under
    // Playwright's WebKit a navigation the page cancels is reported as
    // scheduled and never as cleared — so the wait never returns. Cancelling is
    // exactly what this case asserts the router does.
    const box = (await visibleLink(page, DOCS_PAGE).boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // A no-op yields nothing to await; a reload would blank the panel quickly.
    await page.waitForTimeout(1_000);

    expect(await page.evaluate(() => (window as any).__sameDocument)).toBe(true);
    expect(page.url()).toBe(`${BASE}${DOCS_PAGE}`);
    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    await page.close();
  }, TIMEOUT);

  /**
   * A persisted island is lifted out of the old document and grafted into the
   * new one: taken out once, put back once. Anything beyond that is a second
   * detach the page can observe — an <iframe> in the subtree reloads, and a
   * custom element inside it gets a spurious disconnected/connected pair, which
   * is the exact class of breakage `persist` exists to prevent.
   *
   * Counted rather than asserted on identity on purpose: a node removed and
   * reinserted is still the same node, so `sameInstance` above cannot see this.
   */
  it('takes the island out of the page exactly once while moving it', async () => {
    const { page } = await openDocsWithAssistant();

    await page.evaluate(() => {
      const node = document.querySelector('janux-island[data-jx-persist]')!;
      const counts = { detached: 0, attached: 0 };

      (window as any).__moves = counts;
      new MutationObserver((records) => {
        for (const record of records) {
          if ([...record.removedNodes].includes(node)) counts.detached += 1;
          if ([...record.addedNodes].includes(node)) counts.attached += 1;
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    });

    await visibleLink(page, OTHER_DOCS_PAGE).click();
    await settled(page, OTHER_DOCS_PAGE);

    expect(await page.evaluate(() => (window as any).__moves)).toEqual({ detached: 1, attached: 1 });
    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    await page.close();
  }, TIMEOUT);

  it('still lets a real reload reload', async () => {
    const { page } = await openDocsWithAssistant();

    await page.evaluate(() => {
      (window as any).__sameDocument = true;
    });
    await page.reload({ waitUntil: 'networkidle' });

    expect(await page.evaluate(() => (window as any).__sameDocument)).toBeUndefined();
    await page.close();
  }, TIMEOUT);
});
