import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { isBuilt, launchChrome, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * Scroll restoration across SPA navigations, against a page that streams.
 *
 * `examples/hacker-news` is the honest fixture: its story list is a suspense
 * island over a deliberately slow source, so coming back to it paints a short
 * skeleton first and the full list several hundred milliseconds later. A
 * restore that fires on arrival lands while the document is still the skeleton
 * height and gets clamped — the reader is returned to a list they have to
 * scroll again. Measured at this viewport: 36px of scroll during the skeleton,
 * 249px once the stories land.
 *
 * Only a real engine has the Navigation API, history traversal and a layout to
 * scroll, so this cannot live in the happy-dom suites.
 */

const APP = appRoot('examples/hacker-news');
const BUILT = isBuilt(APP);
const LIST = '/news/1';

/** Short enough that ten stories overflow it, so there is a position to lose. */
const VIEWPORT = { width: 1000, height: 400 };

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchChrome();
});

afterAll(() => {
  stop?.();
});

/** The navigation finished AND no suspense boundary is still pending. */
const settled = async (page: Page) => {
  await page.evaluate(() => (window as any).janux?.settled?.());
  await page.waitForFunction(() => !document.querySelector('[data-jx-pending]'), null, { timeout: 10_000 });
};

/** The stories have landed, so the document is at its full height. */
const listLoaded = (page: Page) =>
  page.waitForFunction(() => document.querySelectorAll('a[href^="/item/"]').length > 0, null, { timeout: 10_000 });

async function openList(): Promise<{ page: Page; errors: string[] }> {
  const { page, errors } = await newPage(browser!);

  await page.setViewportSize(VIEWPORT);
  await page.goto(`${BASE}${LIST}`, { waitUntil: 'networkidle' });
  await listLoaded(page);
  await settled(page);

  return { page, errors };
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/**
 * Clicks the first story from the page itself. Playwright's own `click()`
 * scrolls its target into view first, which would reset the very offset these
 * tests are about before the navigation ever starts.
 */
const openStory = (page: Page) =>
  page.evaluate(() => (document.querySelector('a[href^="/item/"]') as HTMLAnchorElement).click());

/** Scrolls to `y` and returns what the browser actually settled on. */
async function scrollTo(page: Page, y: number): Promise<number> {
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await page.waitForTimeout(100);

  return scrollY(page);
}

describe.skipIf(!BUILT)('scroll restoration (examples/hacker-news)', () => {
  it('restores the exact position when going back to a page that streams in', async () => {
    const { page, errors } = await openList();
    const saved = await scrollTo(page, 200);

    expect(saved).toBe(200);
    await openStory(page);
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);
    // A fresh page starts at the top; anything else would make the assertion below vacuous.
    expect(await scrollY(page)).toBe(0);

    await page.goBack();
    await page.waitForFunction((path) => location.pathname === path, LIST);
    await listLoaded(page);
    await settled(page);
    // Past the moment the skeleton would have clamped a too-early restore.
    await page.waitForTimeout(500);

    expect(await scrollY(page)).toBe(saved);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  /**
   * The clamping hazard stated directly: while the list is still streaming the
   * document is far too short to hold the saved position, so a restore that
   * does not wait for the content ends up at the skeleton's maximum instead.
   */
  it('does not clamp the restore to the height the skeleton had', async () => {
    const { page } = await openList();
    const saved = await scrollTo(page, 220);

    await openStory(page);
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);
    await page.goBack();
    await page.waitForFunction((path) => location.pathname === path, LIST);
    await listLoaded(page);
    await settled(page);
    await page.waitForTimeout(500);

    const skeletonMax = await page.evaluate(() => 436 - window.innerHeight);

    expect(await scrollY(page)).toBe(saved);
    expect(await scrollY(page)).toBeGreaterThan(skeletonMax);
    await page.close();
  }, TIMEOUT);

  /** A new page is a new page: it opens at the top, never at the previous one's offset. */
  it('starts a pushed navigation at the top instead of inheriting the offset', async () => {
    const { page } = await openList();

    await scrollTo(page, 200);
    await openStory(page);
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);

    expect(await scrollY(page)).toBe(0);
    await page.close();
  }, TIMEOUT);

  /** Forward is a traversal too, so its entry's position has to come back as well. */
  it('restores going forward again, not only back', async () => {
    const { page } = await openList();
    const saved = await scrollTo(page, 180);

    await openStory(page);
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);
    const itemOffset = await scrollTo(page, 40);

    await page.goBack();
    await page.waitForFunction((path) => location.pathname === path, LIST);
    await listLoaded(page);
    await settled(page);
    await page.waitForTimeout(500);
    expect(await scrollY(page)).toBe(saved);

    await page.goForward();
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);
    await page.waitForTimeout(500);

    expect(await scrollY(page)).toBe(itemOffset);
    await page.close();
  }, TIMEOUT);

  /**
   * Going back over a navigation that is still in flight. Both are issued in
   * one task so the order is not a race: the push to /news/2 starts, the
   * traversal supersedes it, and the offset that lands has to be the one
   * belonging to the entry that actually won.
   */
  it('restores after an interrupted navigation', async () => {
    const { page, errors } = await openList();
    const saved = await scrollTo(page, 210);
    const listKey = await page.evaluate(() => (window as any).navigation.currentEntry.key);

    await openStory(page);
    await page.waitForFunction(() => location.pathname.startsWith('/item/'));
    await settled(page);

    // Traverse to the list's own entry rather than "back one": the competing
    // push commits its URL first, so a relative back would land on the item.
    await page.evaluate((key) => {
      (window as any).janux.navigate('/news/2').catch(() => {});
      (window as any).navigation.traverseTo(key).finished.catch(() => {});
    }, listKey);
    await page.waitForFunction((path) => location.pathname === path, LIST);
    await listLoaded(page);
    await settled(page);
    await page.waitForTimeout(700);

    expect(await scrollY(page)).toBe(saved);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

});
