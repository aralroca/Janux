import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/nested-islands exists to demonstrate: stateful islands inside
 * stateful islands, three levels deep (Board → Card → Badge). Every level owns
 * its state and mounts independently, the Board's controlled input round-trips
 * through the rename intent, and the conditional `state.cards` list disposes
 * whole subtrees (Card with its Badge) without breaking the page.
 */

const APP = 'examples/nested-islands';
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const card = (page: Page, index: number) => page.locator('.board .card').nth(index);
const counters = (page: Page) => page.locator('.board .card output').allTextContents();
const badges = (page: Page) => page.locator('.board .badge').allTextContents();

describe('examples/nested-islands server side', () => {
  it('server-renders the three island levels nested inside each other', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('data-jx="board#default"');
    // Two cards by default, each hosting its own badge island: the island ids nest.
    expect(html).toContain('data-jx="card#board.default.c0"');
    expect(html).toContain('data-jx="badge#card.board.default.c0.1"');
    expect(html).toContain('data-jx="card#board.default.c1"');
    expect(html).toContain('data-jx="badge#card.board.default.c1.1"');
    expect(html).toContain('aria-label="Board title"');
    expect(html).toContain('My board');
  });

  it('every level contributes its intents to the agent surface', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const names = new Set(manifest.tools.map((tool: any) => tool.name));

    ['board.rename', 'board.add', 'board.remove', 'card.inc', 'badge.toggle'].forEach((name) =>
      expect(names).toContain(name),
    );
  });
});

describe.skipIf(!BUILT)('examples/nested-islands in the browser', () => {
  it('cards and badges mount independently: state never bleeds between siblings or levels', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.board .card');
    expect(await counters(page)).toEqual(['0', '0']);

    await card(page, 0).locator('button:has-text("+1")').click();
    await card(page, 0).locator('button:has-text("+1")').click();
    await page.waitForFunction(
      () => document.querySelector('.board .card output')?.textContent === '2',
      null,
      { timeout: 5_000 },
    );
    // The sibling card did not move, and neither counter touched any badge.
    expect(await counters(page)).toEqual(['2', '0']);
    expect(await badges(page)).toEqual(['☆', '☆']);

    await card(page, 0).locator('.badge').click();
    await page.waitForSelector('.badge-on');
    expect(await badges(page)).toEqual(['★', '☆']);
    expect(await counters(page)).toEqual(['2', '0']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the controlled input renames the board through the rename intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.board input');
    await page.fill('.board input', 'Ops board');
    await page.waitForFunction(
      () => document.querySelector('.board h2')?.textContent === 'Ops board',
      null,
      { timeout: 5_000 },
    );
    expect(await page.locator('.board input').inputValue()).toBe('Ops board');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('conditional dispose removes a whole card+badge subtree; survivors keep their state', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.board .card');
    await card(page, 0).locator('button:has-text("+1")').click();
    await card(page, 0).locator('.badge').click();
    await page.waitForSelector('.badge-on');

    await page.click('.board button:has-text("− card")');
    await page.waitForFunction(() => document.querySelectorAll('.board .card').length === 1, null, {
      timeout: 5_000,
    });
    // The survivor is untouched: counter and badge kept their state through the dispose.
    expect(await counters(page)).toEqual(['1']);
    expect(await badges(page)).toEqual(['★']);

    await page.click('.board button:has-text("− card")');
    await page.waitForFunction(() => document.querySelectorAll('.board .card').length === 0, null, {
      timeout: 5_000,
    });

    await page.click('.board button:has-text("+ card")');
    await page.waitForFunction(() => document.querySelectorAll('.board .card').length === 1, null, {
      timeout: 5_000,
    });
    // Unmounting three levels and remounting left no wreckage behind.
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
