import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt } from './support/app';

/**
 * Shallow routing: the URL moves, the page does not.
 *
 * The property that matters — "nothing re-rendered, nothing was fetched" — is
 * only observable in a real engine, because it is the *absence* of a document
 * load. Every test here plants a value on `window` first: it survives a shallow
 * change and dies with a reload, which is the whole assertion.
 *
 * `examples/data-cache` is the fixture because its catalog binds `?tag=` with
 * `urlState`, so a shallow change has something to prove it reached.
 */

const APP = 'examples/data-cache';
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchBrowser();
});

afterAll(() => {
  stop?.();
});

/**
 * A value only a document load can destroy, plus a count of navigations the
 * router actually ran. Counting page fetches would be noisier: hovering a link
 * warms its stream, so a clicked link fetches whether or not it navigates.
 */
async function openCatalog(): Promise<{ page: Page; errors: string[] }> {
  const { page, errors } = await newPage(browser!);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean((window as any).janux));
  await page.evaluate(() => {
    (window as any).__alive = 'same document';
    (window as any).__navigations = 0;
    document.addEventListener('janux:navigate', (event: any) => {
      if (event.detail.phase === 'before') (window as any).__navigations++;
    });
  });

  return { page, errors };
}

const survived = (page: Page) => page.evaluate(() => (window as any).__alive);
const navigations = (page: Page) => page.evaluate(() => (window as any).__navigations as number);
const search = (page: Page) => page.evaluate(() => location.search);

describe.skipIf(!BUILT)('shallow routing (examples/data-cache)', () => {
  it('moves the URL without reloading or fetching a page', async () => {
    const { page, errors } = await openCatalog();

    await page.evaluate(() => (window as any).janux.navigate('/?tag=video', { shallow: true }));
    await page.waitForFunction(() => location.search === '?tag=video');

    // The document is the same one: a re-render would have taken this with it.
    expect(await survived(page)).toBe('same document');
    // And the router never ran a navigation at all.
    expect(await navigations(page)).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  /** The declarative form: a link that asked for the URL only. */
  it('follows a data-shallow link without re-rendering the page', async () => {
    const { page, errors } = await openCatalog();

    await page.evaluate(() => {
      const link = document.createElement('a');

      link.href = '/?tag=display';
      link.id = 'shallow-link';
      link.dataset.shallow = '';
      link.textContent = 'display';
      document.body.appendChild(link);
    });
    await page.locator('#shallow-link').click();
    await page.waitForFunction(() => location.search === '?tag=display');

    expect(await survived(page)).toBe('same document');
    expect(await navigations(page)).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  /** Shallow is still routing: the entry is real, so Back undoes it. */
  it('leaves a history entry that Back undoes', async () => {
    const { page } = await openCatalog();

    await page.evaluate(() => (window as any).janux.navigate('/?tag=video', { shallow: true }));
    await page.waitForFunction(() => location.search === '?tag=video');
    await page.goBack();
    await page.waitForFunction(() => location.search === '');

    expect(await search(page)).toBe('');
    expect(await survived(page)).toBe('same document');
    await page.close();
  }, TIMEOUT);

  it('replaces the entry instead when asked', async () => {
    const { page } = await openCatalog();
    const before = await page.evaluate(() => history.length);

    await page.evaluate(() => (window as any).janux.navigate('/?tag=video', { shallow: true, replace: true }));
    await page.waitForFunction(() => location.search === '?tag=video');

    expect(await page.evaluate(() => history.length)).toBe(before);
    await page.close();
  }, TIMEOUT);

  /**
   * The contrast that says what shallow is worth: the identical URL change,
   * without asking for it, is a real document load — which is what an app had
   * to work around by hand before.
   */
  it('still loads the document for the same change when shallow was not asked for', async () => {
    const { page } = await openCatalog();

    await page.evaluate(() => (window as any).janux.navigate('/?tag=input', { shallow: true }));
    await page.waitForFunction(() => location.search === '?tag=input');
    expect(await survived(page)).toBe('same document');

    await page.evaluate(() => {
      (window as any).janux.navigate('/?tag=video').catch(() => {});
    });
    await page.waitForFunction(() => location.search === '?tag=video');
    await page.waitForLoadState('load');

    // The sentinel went with the old document.
    expect(await survived(page)).toBeUndefined();
    await page.close();
  }, TIMEOUT);
});
