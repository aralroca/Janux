import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The charts category: `recharts` mounted unchanged.
 *
 * Two things this pins down. Recharts calls `onClick(data, index, event)` — the
 * payload an intent wants is the SECOND argument, which the short
 * `on: { prop: 'intentName' }` form cannot reach at all. And its server render
 * is a sized wrapper with no SVG inside, which is Recharts' own behavior rather
 * than a Janux limit: asserted here so the compatibility matrix's "container
 * only" row stays true instead of aspirational.
 */

const APP = appRoot('examples/interop-charts');
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
const summary = (page: Page) => page.locator('.chart-shell .chart-summary').textContent();
const lines = (page: Page) => page.locator('.recharts-line').count();

describe('examples/interop-charts server side', () => {
  it('server-renders the sized wrapper, and — Recharts being Recharts — nothing inside it', async () => {
    const app = await createTestApp(APP);
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('revenue-chart');
    // The box is reserved at its real size, so the chart cannot shift layout
    // when it arrives…
    expect(html).toContain('recharts-wrapper');
    expect(html).toContain('width:520px');
    // …but Recharts 3 computes its layout in effects, so the SVG is client-only.
    // This is the library's limit, not the boundary's: `renderToString` of a
    // bare <LineChart> outside Janux produces exactly this same empty wrapper.
    expect(html).not.toContain('<svg');
    expect(html).toContain('2/2 series · 6 months');
  });

  it('exposes the chart controls as the agent surface, reset guarded', async () => {
    const app = await createTestApp(APP);
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['chart.toggleSeries']).toBe('auto');
    expect(guards['chart.inspect']).toBe('auto');
    expect(guards['chart.reset']).toBe('confirm');

    const toggle = manifest.tools.find((tool: any) => tool.name === 'chart.toggleSeries');

    expect(toggle.input.properties.key.enum).toEqual(['revenue', 'users']);
  });
});

describe.skipIf(!BUILT)('examples/interop-charts in the browser', () => {
  it('draws the chart on the client and keeps the reserved box', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.recharts-line');
    expect(await lines(page)).toBe(2);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('a legend click round-trips through the toggleSeries intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.recharts-legend-item');
    await page.click('.recharts-legend-item');

    await page.waitForFunction(
      () => document.querySelector('.chart-shell .chart-summary')?.textContent?.includes('1/2 series'),
      null,
      { timeout: 5_000 },
    );
    // Janux state moved, and flowed back into Recharts as a `hide` prop.
    expect(await lines(page)).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent selects a month by calling the same intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.recharts-line');
    await page.waitForSelector('.tool-row:has-text("chart.inspect") button');
    expect(await summary(page)).toContain('nothing selected');

    const example = await page.locator('.tool-row:has-text("chart.inspect") code.example').textContent();
    const target = JSON.parse(example ?? '{}');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

    await page.click('.tool-row:has-text("chart.inspect") button');
    await page.waitForFunction(
      (month) => document.querySelector('.chart-shell .chart-summary')?.textContent?.includes(month),
      months[target.index],
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded reset stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.recharts-legend-item');
    await page.click('.recharts-legend-item');
    await page.waitForFunction(
      () => document.querySelector('.chart-shell .chart-summary')?.textContent?.includes('1/2 series'),
      null,
      { timeout: 5_000 },
    );

    await page.waitForSelector('.tool-row:has-text("chart.reset") button');
    await page.click('.tool-row:has-text("chart.reset") button');
    await page.waitForSelector('.proposal-card');
    // Proposed, not executed: the series is still hidden.
    expect(await lines(page)).toBe(1);

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.chart-shell .chart-summary')?.textContent?.includes('2/2 series'),
      null,
      { timeout: 5_000 },
    );
    expect(await lines(page)).toBe(2);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
