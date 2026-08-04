import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The virtualization category: `@tanstack/react-virtual` mounted unchanged.
 *
 * A virtualizer measures the DOM, which the server does not have — the usual
 * outcome is `hydrate: 'only'` and an empty box. `initialRect` avoids that: the
 * first window is server-rendered at the right total height. And because the
 * list is virtual, an agent cannot "scroll to row 7000" by manipulating the
 * DOM — the row does not exist. It asks the island instead, which is the point.
 */

const APP = appRoot('examples/interop-virtual-list');
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
const summary = (page: Page) => page.locator('.list-shell .list-summary').textContent();

describe('examples/interop-virtual-list server side', () => {
  it('server-renders the first window at the full scroll height', async () => {
    const { fetch: get } = await createTestApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('virtual-list');
    expect(html).toContain('class="vlist"');
    // 10 000 rows × 32px: the scrollbar is honest before any JS runs.
    expect(html).toContain('height:320000px');
    expect(html).toContain('data-index="0"');
    // …and it is a WINDOW, not the whole list: virtualization survived SSR.
    const rendered = html.match(/data-index="/g)?.length ?? 0;

    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(60);
  });

  it('exposes select and scroll as the agent surface, clear guarded', async () => {
    const { fetch: get } = await createTestApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['list.select']).toBe('auto');
    expect(guards['list.scrollToRow']).toBe('auto');
    expect(guards['list.clear']).toBe('confirm');
  });
});

describe.skipIf(!BUILT)('examples/interop-virtual-list in the browser', () => {
  it('a row click round-trips through the select intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.vrow[data-index="3"]');
    expect(await summary(page)).toContain('nothing selected');

    await page.click('.vrow[data-index="3"]');
    await page.waitForFunction(
      () => document.querySelector('.list-shell .list-summary')?.textContent?.includes('selected Row 3'),
      null,
      { timeout: 5_000 },
    );
    // The state flowed back into React as a prop.
    expect(await page.locator('.vrow-selected').getAttribute('data-index')).toBe('3');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent scrolls to a row that is not in the DOM at all', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.vrow[data-index="0"]');
    // Row 5000 genuinely does not exist yet — no DOM-scraping agent could
    // click it, which is exactly why the intent is the interface.
    expect(await page.locator('.vrow[data-index="5000"]').count()).toBe(0);

    await page.waitForSelector('.tool-row:has-text("list.scrollToRow") button');
    const example = await page.locator('.tool-row:has-text("list.scrollToRow") code.example').textContent();
    const target = JSON.parse(example ?? '{}');

    await page.click('.tool-row:has-text("list.scrollToRow") button');
    await page.waitForSelector(`.vrow[data-index="${target.index}"]`, { timeout: 5_000 });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded clear stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.vrow[data-index="3"]');
    await page.click('.vrow[data-index="3"]');
    await page.waitForFunction(
      () => document.querySelector('.list-shell .list-summary')?.textContent?.includes('selected Row 3'),
      null,
      { timeout: 5_000 },
    );

    await page.waitForSelector('.tool-row:has-text("list.clear") button');
    await page.click('.tool-row:has-text("list.clear") button');
    await page.waitForSelector('.proposal-card');
    expect(await page.locator('.vrow-selected').count()).toBe(1);

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.list-shell .list-summary')?.textContent?.includes('nothing selected'),
      null,
      { timeout: 5_000 },
    );
    expect(await page.locator('.vrow-selected').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
