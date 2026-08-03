import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * `@janux/tailwind` zero-config, against the with-tailwind pricing example:
 * SSR links one real stylesheet full of utility classes, `janux build` emits a
 * locally compiled sheet (content-scanned, never a runtime CDN), and in a real
 * Chrome the billing island recalculates every tier when the toggle flips.
 */

const BUILT = isBuilt(appRoot('examples/with-tailwind'));

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(appRoot('examples/with-tailwind')));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

describe('tailwind SSR (examples/with-tailwind)', () => {
  it('links the stylesheet and renders utility classes in the HTML', async () => {
    const app = await createTestApp(appRoot('examples/with-tailwind'));
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('rel="stylesheet"');
    expect(html).toContain('/styles.css');
    expect(html).toContain('md:grid-cols-3');
    expect(html).toContain('dark:bg-slate-950');
    expect(html).toContain('data-price="25"');
    expect(html).not.toContain('cdn.tailwindcss.com');
  });
});

describe.skipIf(!BUILT)('tailwind build output (examples/with-tailwind)', () => {
  it('emits locally compiled utilities, not a runtime CDN', () => {
    const css = readFileSync(join(appRoot('examples/with-tailwind'), 'dist/client/styles.css'), 'utf8');

    expect(css).toContain('@layer theme,base,components,utilities');
    expect(css).toContain('grid-cols-3');
    expect(css).toContain('prefers-color-scheme');
    expect(css).not.toContain('@import');
    expect(css).not.toContain('cdn.tailwindcss.com');
  });
});

describe.skipIf(!BUILT)('billing toggle in Chrome (examples/with-tailwind)', () => {
  it('recalculates every price when switching billing period', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(BASE);
    await page.waitForSelector('[data-tier="Pro"] [data-price="25"]');

    await page.click('button:has-text("Annual")');
    await page.waitForSelector('[data-tier="Pro"] [data-price="250"]');
    expect(await page.locator('[data-tier="Starter"] [data-price="100"]').count()).toBe(1);
    expect(await page.locator('[data-tier="Scale"] [data-price="900"]').count()).toBe(1);
    expect(await page.textContent('[data-tier="Pro"] [data-price]')).toContain('€250');

    await page.click('button:has-text("Monthly")');
    await page.waitForSelector('[data-tier="Pro"] [data-price="25"]');
    expect(errors).toEqual([]);
  }, TIMEOUT);

  it('applies the compiled utilities: the tiers lay out as a grid', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(BASE);
    await page.waitForSelector('[data-tier="Pro"]');

    const display = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-tier="Pro"]')!.parentElement!).display,
    );

    expect(display).toBe('grid');
    expect(errors).toEqual([]);
  }, TIMEOUT);
});
