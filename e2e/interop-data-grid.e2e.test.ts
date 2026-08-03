import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The data-grid category: `@tanstack/react-table` mounted unchanged.
 *
 * What makes this one worth its own example is the callback contract. TanStack
 * hands `on[State]Change` a value OR an updater FUNCTION, which is exactly the
 * shape `on: { prop: 'intentName' }` cannot carry — a function is not a valid
 * intent input. The mapped `on:` form resolves the updater against the island's
 * own state before the intent ever sees it, so a click on a React table header
 * lands as a typed `grid.sort` an agent can call the same way.
 */

const APP = appRoot('examples/interop-data-grid');
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const summary = (page: Page) => page.locator('.grid-shell .grid-summary').textContent();
const names = (page: Page) => page.locator('.grid-row td:first-child').allTextContents();

describe('examples/interop-data-grid server side', () => {
  it('server-renders the TanStack table inside the foreign host', async () => {
    const app = await createTestApp(APP);
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('data-grid');
    // The table markup itself arrived from the server, before any JS ran: a
    // headless table library has nothing that stops it rendering on the server.
    expect(html).toContain('class="grid-table"');
    expect(html).toContain('Margaret');
    expect(html).toContain('6 rows · sorted by score desc');
  });

  it('exposes the grid controls as the agent surface, reset guarded', async () => {
    const app = await createTestApp(APP);
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['grid.sort']).toBe('auto');
    expect(guards['grid.filter']).toBe('auto');
    expect(guards['grid.reset']).toBe('confirm');
    // The column names are IN the contract, so an agent cannot sort by a column
    // that does not exist and get a silent no-op.
    const sort = manifest.tools.find((tool: any) => tool.name === 'grid.sort');

    expect(sort.input.properties.column.enum).toEqual(['name', 'team', 'score']);
  });
});

describe.skipIf(!BUILT)('examples/interop-data-grid in the browser', () => {
  it('a header click resolves TanStack\'s updater function into the sort intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.grid-sort[data-column="name"]');
    expect((await names(page))[0]).toBe('Margaret');

    // getToggleSortingHandler() calls setSorting(updater) — the callback receives
    // a FUNCTION. Reaching the intent at all is the thing being proven here.
    await page.click('.grid-sort[data-column="name"]');
    await page.waitForFunction(
      () => document.querySelector('.grid-shell .grid-summary')?.textContent?.includes('sorted by name asc'),
      null,
      { timeout: 5_000 },
    );
    // Janux state moved, and flowed back into React as props.
    expect((await names(page))[0]).toBe('Ada');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the React filter box round-trips through the filter intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.grid-filter');
    await page.fill('.grid-filter', 'Infra');

    await page.waitForFunction(() => document.querySelectorAll('.grid-row').length === 2, null, { timeout: 5_000 });
    expect(await summary(page)).toContain('filter "Infra"');
    expect((await names(page)).sort()).toEqual(['Linus', 'Margaret']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent sorts the React table by calling the same intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.grid-table');
    await page.waitForSelector('.tool-row:has-text("grid.sort") button');

    const example = await page.locator('.tool-row:has-text("grid.sort") code.example').textContent();
    const target = JSON.parse(example ?? '{}');

    await page.click('.tool-row:has-text("grid.sort") button');
    await page.waitForFunction(
      (column) => document.querySelector('.grid-shell .grid-summary')?.textContent?.includes(`sorted by ${column}`),
      target.column,
      { timeout: 5_000 },
    );
    // The React table re-rendered from the agent's call: no DOM was scraped and
    // no header was clicked.
    expect(await page.locator(`.grid-sort[data-column="${target.column}"]`).textContent()).toContain(
      target.desc ? '↓' : '↑',
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded reset stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.grid-filter');
    await page.fill('.grid-filter', 'Infra');
    await page.waitForFunction(() => document.querySelectorAll('.grid-row').length === 2, null, { timeout: 5_000 });

    await page.waitForSelector('.tool-row:has-text("grid.reset") button');
    await page.click('.tool-row:has-text("grid.reset") button');
    await page.waitForSelector('.proposal-card');
    // Proposed, not executed: the filter is still on.
    expect(await page.locator('.grid-row').count()).toBe(2);

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(() => document.querySelectorAll('.grid-row').length === 6, null, { timeout: 5_000 });
    expect(await summary(page)).toContain('sorted by score desc');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
