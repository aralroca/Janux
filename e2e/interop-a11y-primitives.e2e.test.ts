import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The a11y-primitives category: `@radix-ui/react-dialog` mounted unchanged.
 *
 * This is the example the portal fix exists for. Radix renders its dialog
 * through a portal into `document.body` — outside the `<janux-foreign>` host
 * the navigation morph treats as an opaque leaf. Before the fix, navigating
 * away with the dialog open removed nodes the React root still owned, React
 * threw `removeChild: the node to be removed is not a child of this node`, and
 * the teardown aborted midway: the scroll lock was never released, so the next
 * page could not be scrolled. Both halves are asserted below.
 */

const APP = appRoot('examples/interop-a11y-primitives');
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
const status = (page: Page) => page.locator('.dialog-shell .dialog-status').textContent();

describe('examples/interop-a11y-primitives server side', () => {
  it('server-renders the trigger with its ARIA contract intact', async () => {
    const { fetch: get } = await createTestApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('confirm-dialog');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Acme · dialog closed');
  });

  it('exposes the dialog state as the agent surface, deletion guarded', async () => {
    const { fetch: get } = await createTestApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['workspace.setOpen']).toBe('auto');
    expect(guards['workspace.remove']).toBe('confirm');
  });
});

describe.skipIf(!BUILT)('examples/interop-a11y-primitives in the browser', () => {
  it('opens through the intent, and the portal really does escape the host', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.danger');
    await page.click('.danger');
    await page.waitForSelector('.sheet');

    // Radix's own behavior, stated as a fact rather than assumed: the dialog is
    // a direct child of <body>, NOT inside the foreign host.
    const escaped = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');

      return { insideHost: !!sheet?.closest('janux-foreign'), inBody: sheet?.closest('body') !== null };
    });

    expect(escaped.insideHost).toBe(false);
    expect(escaped.inBody).toBe(true);
    // …and the open/closed state went through the island, not just React.
    expect(await status(page)).toBe('Acme · dialog open');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('survives a client-side navigation with the dialog open, scroll lock released', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.danger');
    await page.click('.danger');
    await page.waitForSelector('.sheet');
    // Radix locks body scrolling while a modal is open.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    // A real modal blocks pointer events outside itself — Radix working as
    // intended — so a human cannot click this link right now. The navigation
    // that CAN happen with a dialog open is a programmatic one: an agent's
    // `ui_navigate`, a history entry, a timeout. That is what is driven here.
    await page.evaluate(() => (document.querySelector('.bar-link') as HTMLElement).click());
    await page.waitForSelector('.settings-note');

    // No `removeChild` explosion on the way out…
    expect(errors).toEqual([]);
    expect(await page.locator('.sheet').count()).toBe(0);
    // …and the teardown ran to completion, so the next page scrolls. This is
    // the half that a try/catch around unmount would NOT have fixed.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    await page.close();
  }, TIMEOUT);

  it('the agent opens the dialog by calling the same intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.danger');
    await page.waitForSelector('.tool-row:has-text("workspace.setOpen") button');
    await page.click('.tool-row:has-text("workspace.setOpen") button');

    await page.waitForSelector('.sheet');
    expect(await status(page)).toBe('Acme · dialog open');
    // Radix's focus trap is live: the dialog owns focus, exactly as it would
    // have if a human had clicked the trigger.
    expect(await page.evaluate(() => !!document.activeElement?.closest('.sheet'))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded delete stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("workspace.remove") button');
    await page.click('.tool-row:has-text("workspace.remove") button');
    await page.waitForSelector('.proposal-card');
    expect(await status(page)).toBe('Acme · dialog closed');

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.dialog-shell .dialog-status')?.textContent === 'Acme deleted',
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
