import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { prodServerOptions } from '../packages/janux-cli/src/prod';
import { staticResponse } from '../packages/janux-cli/src/static-assets';

/**
 * The Ask AI panel is a `persist` island: opening it and touring the menu must
 * never lose it. Both regressions here were found by touring with the panel
 * open — a route that forgot to render the island (/playground, before the
 * layout owned it), and a click on the current page's own menu item, which the
 * router declined to intercept and the browser answered with a full reload.
 * Neither is observable in happy-dom: one needs real navigations, the other a
 * browser that actually performs the default action of an uncancelled click.
 */

const APP_ROOT = join(import.meta.dir, '../apps/docs');
const BUILT = existsSync(join(APP_ROOT, 'dist/client'));
const PORT = 4399;
const BASE = `http://localhost:${PORT}`;
const DOCS_PAGE = '/docs/getting-started/what-is-janux';
const OTHER_DOCS_PAGE = '/docs/getting-started/quick-start';
/** Launching Chrome and driving real navigations does not fit bun's 5s default. */
const TIMEOUT = 60_000;

let server: ReturnType<typeof Bun.serve> | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  const app = createJanuxServer(await prodServerOptions(APP_ROOT));
  const staticDir = join(APP_ROOT, 'dist/client');

  server = Bun.serve({
    port: PORT,
    fetch: async (req) => (await staticResponse(staticDir, req)) ?? app.fetch(req),
  });
  // Chrome proper: the Navigation API drives both behaviors under test.
  browser = await chromium.launch({ channel: 'chrome' });
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

async function openDocsWithAssistant(): Promise<{ page: Page; warnings: string[] }> {
  const page = await browser!.newPage();
  const warnings: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`${BASE}${DOCS_PAGE}`, { waitUntil: 'networkidle' });
  await page.locator('.copilot-toggle').click();
  await page.waitForSelector('janux-island[data-jx-persist] input');
  // Tag the live node: proving the SAME element survived is the whole point —
  // a re-rendered copy would look identical and be a different instance.
  await page.evaluate(() => {
    (document.querySelector('janux-island[data-jx-persist]') as any).__probe = 'live';
  });

  return { page, warnings };
}

const assistantState = (page: Page) =>
  page.evaluate(() => {
    const node = document.querySelector('janux-island[data-jx-persist]') as any;

    return {
      exists: !!node,
      sameInstance: node?.__probe === 'live',
      open: !!node?.querySelector('input[name="text"]'),
    };
  });

/** The sidebar renders twice (a mobile `details` and the desktop nav); only one is clickable. */
const visibleLink = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first();

const settled = (page: Page, path: string) =>
  page.waitForFunction(
    (expected) => location.pathname === expected && !!document.querySelector('janux-island[data-jx-persist]'),
    path,
  );

describe.skipIf(!BUILT)('Ask AI persistence across the docs menu (apps/docs)', () => {
  it('survives a round trip through /playground with the panel open', async () => {
    const { page, warnings } = await openDocsWithAssistant();

    await visibleLink(page, '/playground').click();
    await settled(page, '/playground');

    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });

    await visibleLink(page, OTHER_DOCS_PAGE).click();
    await settled(page, OTHER_DOCS_PAGE);

    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    expect(warnings.filter((text) => text.includes('persisted island'))).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('treats a click on the current page’s own menu item as a no-op, not a reload', async () => {
    const { page } = await openDocsWithAssistant();

    await page.evaluate(() => {
      (window as any).__sameDocument = true;
    });
    await visibleLink(page, DOCS_PAGE).click();
    // A no-op yields nothing to await; a reload would blank the panel quickly.
    await page.waitForTimeout(1_000);

    expect(await page.evaluate(() => (window as any).__sameDocument)).toBe(true);
    expect(page.url()).toBe(`${BASE}${DOCS_PAGE}`);
    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    await page.close();
  }, TIMEOUT);

  it('still lets a real reload reload', async () => {
    const { page } = await openDocsWithAssistant();

    await page.evaluate(() => {
      (window as any).__sameDocument = true;
    });
    await page.reload({ waitUntil: 'networkidle' });

    expect(await page.evaluate(() => (window as any).__sameDocument)).toBeUndefined();
    await page.close();
  }, TIMEOUT);
});
