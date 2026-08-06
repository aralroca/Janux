import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What examples/with-optimistic-ui exists to demonstrate: `mutation()` writes
 * the star into the `useQuery` cache before the server answers (`onMutate`),
 * and when the server rejects — every 3rd save fails on purpose, behind an
 * artificial delay — `onError` restores the snapshot: the item visibly appears
 * and then disappears, with a notice. Only a real browser shows that window.
 */

const BUILT = isBuilt(appRoot('examples/with-optimistic-ui'));

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(appRoot('examples/with-optimistic-ui')));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const favorites = (page: Page) => page.locator('.favorites .fav').allTextContents();
const starButton = (name: string) => `.items .row:has-text("${name}") .star`;
const waitForCount = (page: Page, total: number) =>
  page.waitForFunction(
    (expected) => document.querySelector('.count')?.textContent === `favorites:${expected}`,
    total,
    { timeout: 10_000 },
  );
const waitForSettled = (page: Page) =>
  page.waitForFunction(() => !document.querySelector('.fav.pending'), undefined, { timeout: 10_000 });

/** Fresh page with server state wiped: the failure counter restarts at zero. */
const openReset = async (page: Page) => {
  await page.goto(`${BASE}/`);
  // The list replaces `Loading…` once the island resumed and the query
  // resolved; empty, it has no box, so wait for attachment, not visibility.
  await page.waitForSelector('.favorites', { state: 'attached', timeout: 10_000 });
  await page.click('.reset');
  await waitForCount(page, 0);
};

const starAndSettle = async (page: Page, name: string, total: number) => {
  await page.click(starButton(name));
  await waitForSettled(page);
  await waitForCount(page, total);
};

describe('examples/with-optimistic-ui server side', () => {
  it('ships the item list from the server, favorites pending until the client resumes', async () => {
    const { fetch: get } = await createTestApp(appRoot('examples/with-optimistic-ui'));
    const html = await (await get('/')).text();

    expect(html).toContain('<title>Janux — optimistic UI</title>');
    ['Aurora', 'Comet', 'Eclipse'].forEach((name) => expect(html).toContain(`<span>${name}</span>`));
    expect(html).toContain('Loading…');
  });

  it('exposes the star intent and the favorites api as agent tools', async () => {
    const { fetch: get } = await createTestApp(appRoot('examples/with-optimistic-ui'));
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['favorites.star']).toBe('auto');
    expect(guards['api.favorites.addFavorite']).toBe('auto');
    expect(guards['api.favorites.listFavorites']).toBe('auto');
  });
});

describe.skipIf(!BUILT)('examples/with-optimistic-ui in the browser', () => {
  it('starring paints the favorite instantly, before the server answers', async () => {
    const { page, errors } = await openPage();

    await openReset(page);
    await page.click(starButton('Aurora'));
    // `.pending` is the optimistic entry `onMutate` wrote — it exists only
    // while the (artificially delayed) request is still in flight, which is a
    // 600ms window. Name and pending-ness are therefore asserted by ONE wait:
    // resolving the locator a second time to read its text is a second round
    // trip, and on a loaded runner the save lands inside it.
    const pending = page.locator('.favorites .fav.pending', { hasText: 'Aurora' });

    await pending.waitFor({ state: 'visible', timeout: 10_000 });
    await waitForSettled(page);
    await waitForCount(page, 1);
    expect(await favorites(page)).toEqual(['Aurora']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the 3rd save is rejected: the star appears, rolls back and a notice shows', async () => {
    const { page, errors } = await openPage();

    await openReset(page);
    await starAndSettle(page, 'Aurora', 1);
    await starAndSettle(page, 'Comet', 2);
    await page.click(starButton('Eclipse'));
    await page.waitForSelector('.favorites .fav.pending', { timeout: 10_000 });
    await page.waitForSelector('.notice', { timeout: 10_000 });
    await waitForSettled(page);
    await waitForCount(page, 2);
    expect(await favorites(page)).toEqual(['Aurora', 'Comet']);
    expect(await page.locator('.notice').textContent()).toContain('Eclipse');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('survivors persist: after a reload the refetch returns only confirmed favorites', async () => {
    const { page, errors } = await openPage();

    await openReset(page);
    await starAndSettle(page, 'Nebula', 1);
    await starAndSettle(page, 'Pulsar', 2);
    await page.click(starButton('Quasar'));
    await page.waitForSelector('.notice', { timeout: 10_000 });
    await waitForCount(page, 2);

    await page.reload();
    await waitForCount(page, 2);
    expect(await favorites(page)).toEqual(['Nebula', 'Pulsar']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
