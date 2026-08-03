import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What a screen-reader user experiences when an SPA navigation replaces the
 * page: the document never reloads, so nothing tells them the page changed —
 * the focus stays wherever it was and no live region speaks. Lighthouse audits
 * documents, not transitions, so a 100 score says nothing about this.
 *
 * It can only be asserted in a real engine: happy-dom has no Navigation API,
 * which is what drives these navigations.
 *
 * https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
 */

const BUILT = isBuilt(appRoot('apps/docs'));
const FIRST = '/docs/getting-started/what-is-janux';
const SECOND = '/docs/getting-started/quick-start';

const ANNOUNCER = '[aria-live="assertive"]';

let stop: (() => void) | undefined;
let browser: Browser | undefined;
let BASE = '';

beforeAll(async () => {
  if (!BUILT) return;
  const served = await startTestServer(appRoot('apps/docs'));

  BASE = served.url;
  stop = served.stop;
  // Chrome proper: the Navigation API is what turns these clicks into SPA
  // navigations, and it is the engine that ships it.
  browser = await launchBrowser();
});

afterAll(() => {
  stop?.();
});

/** The sidebar renders twice (a mobile `details` and the desktop nav); only one is clickable. */
const sidebarLink = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first();

async function openDocs(): Promise<{ page: Page; errors: string[] }> {
  const { page, errors } = await openPage(browser!);

  await page.goto(`${BASE}${FIRST}`, { waitUntil: 'networkidle' });

  return { page, errors };
}

/** Clicks through to `href` and waits for the navigation to have fully settled. */
async function navigateTo(page: Page, href: string): Promise<void> {
  await sidebarLink(page, href).click();
  await page.waitForFunction((path) => location.pathname === path, href);
  await page.waitForFunction(
    (path) => (window as any).__after?.includes(path),
    href,
  );
}

/** Records `janux:navigate` completions so tests wait for the real end of a navigation. */
async function trackNavigations(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__after = [];
    document.addEventListener('janux:navigate', (event: any) => {
      if (event.detail.phase === 'after') (window as any).__after.push(new URL(event.detail.to).pathname);
    });
  });
}

const activeElement = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;

    return {
      tag: active?.tagName ?? null,
      text: active?.textContent?.trim() ?? null,
      tabindex: active?.getAttribute('tabindex') ?? null,
      inPersistedIsland: !!active?.closest('[data-jx-persist]'),
    };
  });

describe.skipIf(!BUILT)('screen-reader accessibility of SPA navigation (apps/docs)', () => {
  it('moves focus into the new page content after a navigation', async () => {
    const { page, errors } = await openDocs();

    await trackNavigations(page);
    await navigateTo(page, SECOND);

    const active = await activeElement(page);

    // The heading of the page just navigated to — not the link that was clicked,
    // which is where the browser leaves focus on its own.
    expect(active.tag).toBe('H1');
    expect(active.text).toContain('Quick start');
    // A heading is not focusable without it, so the runtime must have added it.
    expect(active.tabindex).toBe('-1');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('announces the new page title in an assertive live region', async () => {
    const { page, errors } = await openDocs();

    await trackNavigations(page);
    await navigateTo(page, SECOND);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector)?.textContent ?? '').length > 0,
      ANNOUNCER,
    );

    const announced = await page.evaluate((selector) => {
      const region = document.querySelector(selector);

      return { text: region?.textContent?.trim() ?? '', title: document.title, atomic: region?.getAttribute('aria-atomic') };
    }, ANNOUNCER);

    expect(announced.title).toContain('Quick start');
    expect(announced.text).toBe(announced.title);
    // Without it a reader may speak only the changed words, not the whole title.
    expect(announced.atomic).toBe('true');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('keeps the announcer out of sight and out of the layout', async () => {
    const { page } = await openDocs();

    await trackNavigations(page);
    await navigateTo(page, SECOND);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector)?.textContent ?? '').length > 0,
      ANNOUNCER,
    );

    const geometry = await page.evaluate((selector) => {
      const region = document.querySelector(selector) as HTMLElement;
      const style = getComputedStyle(region);
      const rect = region.getBoundingClientRect();
      const root = document.documentElement;

      return {
        position: style.position,
        width: rect.width,
        height: rect.height,
        overflowsHorizontally: root.scrollWidth > root.clientWidth,
        // Text a sighted user could read would show up here.
        readable: style.clip !== 'auto' || style.clipPath !== 'none',
      };
    }, ANNOUNCER);

    // Out of flow, so it occupies no space in the layout at all.
    expect(geometry.position).toBe('absolute');
    expect(geometry.width).toBeLessThanOrEqual(1);
    expect(geometry.height).toBeLessThanOrEqual(1);
    expect(geometry.readable).toBe(true);
    expect(geometry.overflowsHorizontally).toBe(false);
    await page.close();
  }, TIMEOUT);

  /**
   * A persisted island survives navigations by design and owns its own focus —
   * the docs assistant is one, and yanking the caret out of its input mid-typing
   * because it navigated somewhere is worse than not moving focus at all. The
   * announcement still happens: the page did change.
   */
  it('does not steal focus from a persisted widget that manages its own', async () => {
    const { page, errors } = await openDocs();

    await page.locator('.copilot-toggle').click();
    await page.waitForSelector('janux-island[data-jx-persist] input');
    await page.locator('janux-island[data-jx-persist] input').focus();
    await trackNavigations(page);
    await page.evaluate((path) => (window as any).janux.navigate(path), SECOND);
    await page.waitForFunction((path) => (window as any).__after?.includes(path), SECOND);

    const active = await activeElement(page);

    expect(active.tag).toBe('INPUT');
    expect(active.inPersistedIsland).toBe(true);
    // The page still changed, so it is still announced.
    await page.waitForFunction(
      (selector) => (document.querySelector(selector)?.textContent ?? '').includes('Quick start'),
      ANNOUNCER,
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
