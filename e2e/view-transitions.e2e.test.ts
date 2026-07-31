import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, serveBuilt } from './support/app';

/**
 * View transitions can only be observed in an engine that has them: happy-dom
 * has no `startViewTransition`, no `prefers-reduced-motion`, and no animation
 * timeline to interrupt. Chrome has all three.
 *
 * `examples/shop` opts in (`navigation.viewTransitions`); `apps/docs` does not,
 * which is what makes the opt-in assertable rather than merely claimed.
 *
 * The routes are `/shop` and `/orders/*` on purpose: the shop landing ships
 * zero JavaScript by design, so there is no runtime on it to intercept a click.
 *
 * https://developer.mozilla.org/docs/Web/API/View_Transition_API
 */

const SHOP_BUILT = isBuilt('examples/shop');
const DOCS_BUILT = isBuilt('apps/docs');

const SHOP = '/shop';
const ORDER = '/orders/o_1';
const OTHER_ORDER = '/orders/o_2';

let browser: Browser | undefined;
let shop: Awaited<ReturnType<typeof serveBuilt>> | undefined;
let docs: Awaited<ReturnType<typeof serveBuilt>> | undefined;

beforeAll(async () => {
  if (SHOP_BUILT) shop = await serveBuilt('examples/shop');
  if (DOCS_BUILT) docs = await serveBuilt('apps/docs');
  if (SHOP_BUILT || DOCS_BUILT) browser = await launchChrome();
});

afterAll(() => {
  shop?.stop();
  docs?.stop();
});

/**
 * Counts transitions and records whether each one actually animated. A
 * transition the browser abandons still applies the DOM change, so counting
 * calls alone would pass on a page that never animated at all.
 */
const INSTRUMENT = () => {
  const native = (document as any).startViewTransition?.bind(document);

  (window as any).__vt = { calls: 0, animated: 0, skipped: 0 };
  if (!native) return;
  (document as any).startViewTransition = (callback: any) => {
    const transition = native(callback);

    (window as any).__vt.calls++;
    transition.ready.then(() => (window as any).__vt.animated++, () => (window as any).__vt.skipped++);
    transition.finished.catch(() => {});

    return transition;
  };
};

async function openPage(base: string, path: string, reducedMotion?: 'reduce'): Promise<Page> {
  const context = await browser!.newContext(reducedMotion ? { reducedMotion } : {});
  const page = await context.newPage();

  await page.addInitScript(INSTRUMENT);
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    (window as any).__after = [];
    document.addEventListener('janux:navigate', (event: any) => {
      if (event.detail.phase === 'after') (window as any).__after.push(new URL(event.detail.to).pathname);
    });
  });

  return page;
}

const settled = (page: Page, path: string) =>
  page.waitForFunction((target) => (window as any).__after?.includes(target), path);

/** A real SPA navigation through the Navigation API interceptor, awaited to completion. */
const navigate = (page: Page, path: string) =>
  page.evaluate((target) => (window as any).janux.navigate(target), path);

/** The same, left in flight — the only way to interrupt one halfway. */
const startNavigating = (page: Page, path: string) =>
  page.evaluate((target) => {
    (window as any).janux.navigate(target).catch(() => {});
  }, path);

const transitions = (page: Page) => page.evaluate(() => (window as any).__vt);

/** View-transition animations still on the timeline — a frozen frame leaves them behind. */
const liveTransitionAnimations = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation: any) => String(animation.effect?.pseudoElement ?? '').startsWith('::view-transition'))
        .length,
  );

describe.skipIf(!SHOP_BUILT)('view transitions (examples/shop, opted in)', () => {
  it('animates the navigation with a single view transition', async () => {
    const page = await openPage(shop!.base, SHOP);

    await navigate(page, ORDER);
    await settled(page, ORDER);

    // One for the whole page, not one per streamed chunk — and it really ran:
    // an abandoned transition swaps the DOM with no animation at all.
    expect(await transitions(page)).toEqual({ calls: 1, animated: 1, skipped: 0 });
    expect(await page.locator('h1').textContent()).toContain('Order o_1');
    await page.close();
  }, TIMEOUT);

  /**
   * The shared element: the topbar wordmark declares the same
   * `view-transition-name` on both routes, so the browser pairs them and
   * carries one into the other instead of cross-fading it with the page.
   */
  it('pairs the shared element by view-transition-name across both routes', async () => {
    const page = await openPage(shop!.base, SHOP);
    const wordmark = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('.brand')!).viewTransitionName);

    expect(await wordmark()).toBe('wordmark');
    await navigate(page, ORDER);
    await settled(page, ORDER);

    expect(await wordmark()).toBe('wordmark');
    await page.close();
  }, TIMEOUT);

  /** Not negotiable: asked for less motion means the API is never invoked. */
  it('starts no transition at all under prefers-reduced-motion: reduce', async () => {
    const page = await openPage(shop!.base, SHOP, 'reduce');

    await navigate(page, ORDER);
    await settled(page, ORDER);

    expect((await transitions(page)).calls).toBe(0);
    // Degrading means no animation, not no page.
    expect(await page.locator('h1').textContent()).toContain('Order o_1');
    await page.close();
  }, TIMEOUT);

  /**
   * The interruption case. Navigating again while a transition is running must
   * not leave the old snapshot painted over a page that has already moved on:
   * the superseded transition has to be skipped, not waited out.
   */
  it('navigating again mid-transition leaves no frozen frame', async () => {
    const page = await openPage(shop!.base, SHOP);

    await startNavigating(page, ORDER);
    await page.waitForFunction(() => (window as any).__vt.calls >= 1);
    await navigate(page, OTHER_ORDER);
    await settled(page, OTHER_ORDER);
    await page.waitForTimeout(1_000);

    // The last navigation won, and nothing is still animating over the page.
    expect(await page.locator('h1').textContent()).toContain('Order o_2');
    expect(await liveTransitionAnimations(page)).toBe(0);
    // Still interactive: a frozen document would not respond to a real click.
    await page.locator(`a[href="${SHOP}"]`).first().click();
    await settled(page, SHOP);
    expect(await page.locator('.shop').first().isVisible()).toBe(true);
    await page.close();
  }, TIMEOUT);

  /** Point 15 runs after the transition, never during it. */
  it('announces and focuses only once the transition has finished', async () => {
    const page = await openPage(shop!.base, SHOP);

    await navigate(page, ORDER);
    await settled(page, ORDER);

    // `after` means settled, so by the time it fires the transition is over.
    expect(await liveTransitionAnimations(page)).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('H1');
    // The announcement itself lands a beat later: a live region only speaks on
    // a change, so the text is set in a separate turn.
    await page.waitForFunction(
      () => (document.querySelector('[aria-live="assertive"]')?.textContent ?? '').length > 0,
    );
    expect(
      await page.evaluate(() => document.querySelector('[aria-live="assertive"]')?.textContent ?? ''),
    ).toContain('Order o_1');
    await page.close();
  }, TIMEOUT);
});

describe.skipIf(!DOCS_BUILT)('view transitions are opt-in (apps/docs, not configured)', () => {
  it('never starts a transition for an app that did not ask for one', async () => {
    const page = await openPage(docs!.base, '/docs/getting-started/what-is-janux');

    await page.locator('a[href="/docs/getting-started/quick-start"]:visible').first().click();
    await settled(page, '/docs/getting-started/quick-start');

    expect((await transitions(page)).calls).toBe(0);
    await page.close();
  }, TIMEOUT);
});
