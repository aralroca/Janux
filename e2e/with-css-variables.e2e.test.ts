import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage, serveBuilt, ssrApp } from './support/app';

/**
 * Runtime theming against the with-css-variables example. Asserting the custom
 * property alone would prove nothing — a variable nobody reads changes no
 * pixels — so every case checks the *computed* style that came out of it.
 */

const BUILT = isBuilt('examples/with-css-variables');

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt('examples/with-css-variables'));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

const themed = (page: Page) =>
  page.evaluate(() => ({
    brand: (document.querySelector('.theme') as HTMLElement).style.getPropertyValue('--brand'),
    ctaBackground: getComputedStyle(document.querySelector('.cta')!).backgroundColor,
    ctaRadius: getComputedStyle(document.querySelector('.cta')!).borderRadius,
    previewPadding: getComputedStyle(document.querySelector('.preview')!).padding,
  }));

describe('css variables SSR (examples/with-css-variables)', () => {
  it('renders the custom properties inline on the server', async () => {
    const { get } = await ssrApp('examples/with-css-variables');
    const html = await (await get('/')).text();

    expect(html).toContain('--brand');
    expect(html).toContain('#0062ff');
    expect(html).toContain('data-brand="ocean"');
  });
});

describe.skipIf(!BUILT)('retheming in Chrome (examples/with-css-variables)', () => {
  it('repaints the page from state, without loading any new CSS', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(BASE);
    await page.waitForSelector('.theme[data-brand="ocean"]');

    const sheets = await page.evaluate(() => document.styleSheets.length);

    expect(await themed(page)).toMatchObject({ brand: '#0062ff', ctaBackground: 'rgb(0, 98, 255)' });

    await page.click('.knob [data-option="ember"]');
    await page.waitForSelector('.theme[data-brand="ember"]');
    expect(await themed(page)).toMatchObject({ brand: '#d1442f', ctaBackground: 'rgb(209, 68, 47)' });

    // The whole point: a new theme is new values, not a new stylesheet.
    expect(await page.evaluate(() => document.styleSheets.length)).toBe(sheets);
    expect(errors).toEqual([]);
  }, TIMEOUT);

  it('drives spacing and radius from the same mechanism', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(BASE);
    await page.waitForSelector('.theme[data-brand="ocean"]');
    expect(await themed(page)).toMatchObject({ ctaRadius: '16px', previewPadding: '20px' });

    await page.click('[data-option="compact"]');
    await page.click('[data-option="sharp"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.cta')!).borderRadius === '2.4px');

    expect(await themed(page)).toMatchObject({ ctaRadius: '2.4px', previewPadding: '11.2px' });
    expect(errors).toEqual([]);
  }, TIMEOUT);
});
