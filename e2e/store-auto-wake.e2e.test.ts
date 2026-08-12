import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What examples/store-auto-wake exists to demonstrate: a store's first
 * client-side write resumes every inert island that declares it in `use` —
 * nothing on the page is `eager`. The scoreboard ships its SSR "kickoff"
 * branch and runs zero component code until the bench writes the store; the
 * wake re-runs its view against live state and reconciles the flipped
 * conditional in place, reusing the SSR node instead of replacing it.
 */

const APP = appRoot('examples/store-auto-wake');
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

const scoreboard = (page: Page) => page.locator('output.scoreboard');

async function goal(page: Page, side: 'home' | 'away', expected: string): Promise<void> {
  await page.locator(`button:has-text("Goal ${side}")`).click();
  await page.waitForFunction(
    (score) => document.querySelector('output.scoreboard')?.textContent?.trim() === score,
    expected,
    { timeout: 5_000 },
  );
}

describe('examples/store-auto-wake server side', () => {
  it('SSRs the kickoff branch and stamps the readers, with nothing eager', async () => {
    const app = await createTestApp(APP);
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('Kickoff pending');
    // The dependency travels on the host: `use: { score }` becomes data-jx-use.
    expect(html).toMatch(/<janux-island[^>]*data-jx="scoreboard#default"[^>]*data-jx-use="score"/);
    expect(html).toMatch(/<janux-island[^>]*data-jx="bench#default"[^>]*data-jx-use="score"/);
    // The footer declares no store, so no write may ever wake it.
    expect(html).not.toMatch(/<janux-island[^>]*data-jx="match-footer#default"[^>]*data-jx-use/);
    // The whole point of the example: no island opts out of resumability.
    expect(html).not.toContain('data-jx-eager');
  });

  it('exposes the score store and both goal intents on the agent surface', async () => {
    const app = await createTestApp(APP);
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const names = new Set(manifest.tools.map((tool: any) => tool.name));
    const score = manifest.resources.find((entry: any) => entry.uri === 'store://score');

    ['score.goal', 'bench.goal'].forEach((name) => expect(names).toContain(name));
    // The manifest already knows the blast radius the client wake acts on.
    expect(score.readers).toContain('ui://scoreboard');
  });
});

describe.skipIf(!BUILT)('examples/store-auto-wake in the browser', () => {
  it('the first store write wakes the inert scoreboard: the flipped conditional patches in place', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.bench');
    expect((await scoreboard(page).textContent())?.trim()).toBe('Kickoff pending…');

    // The bench resumes on this click, writes the store, and the write is what
    // wakes the scoreboard — no interaction ever targets the scoreboard itself.
    await goal(page, 'home', '1 – 0');
    await goal(page, 'away', '1 – 1');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the woken scoreboard keeps its SSR node: reconcile patches, never replaces', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.bench');
    // A JS-only marker survives attribute/text patches but not a node swap.
    await page.evaluate(() => {
      (document.querySelector('output.scoreboard') as any).__ssrNode = true;
    });

    await goal(page, 'home', '1 – 0');
    expect(await page.evaluate(() => (document.querySelector('output.scoreboard') as any).__ssrNode)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
