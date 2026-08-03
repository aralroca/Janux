import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * The command-palette category: `cmdk` mounted unchanged.
 *
 * The point here is not a difficult callback — cmdk's are the easy end of the
 * spectrum — but that the palette's command list and the agent's tool schema are
 * literally the same list. Whatever a human can pick, the agent can call, and
 * neither can invent a command that does not exist.
 */

const APP = 'examples/interop-command-palette';
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
const log = (page: Page) => page.locator('.palette-shell .palette-log').textContent();

describe('examples/interop-command-palette server side', () => {
  it('server-renders the whole palette, cmdk internals and all', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('cmdk-root');
    expect(html).toContain('data-command="new-doc"');
    expect(html).toContain('Archive workspace');
    expect(html).toContain('nothing run yet');
  });

  it('the palette IS the tool schema: every command is in the enum', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['palette.run']).toBe('auto');
    expect(guards['palette.search']).toBe('auto');
    expect(guards['palette.clear']).toBe('confirm');

    const run = manifest.tools.find((tool: any) => tool.name === 'palette.run');
    const html = await (await get('/')).text();
    const rendered = [...html.matchAll(/data-command="([a-z-]+)"/g)].map((match) => match[1]);

    // The two lists are the same list — this is the whole claim of the example.
    expect(run.input.properties.id.enum).toEqual(rendered);
  });
});

describe.skipIf(!BUILT)('examples/interop-command-palette in the browser', () => {
  it('typing filters through cmdk and the query round-trips through the intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.palette-item');
    expect(await page.locator('.palette-item').count()).toBe(5);

    await page.fill('.palette-input', 'new');
    // cmdk did its own fuzzy filtering, from a value that went out to the
    // island and came back as a prop.
    await page.waitForFunction(() => document.querySelectorAll('.palette-item').length === 2, null, { timeout: 5_000 });
    expect(await page.inputValue('.palette-input')).toBe('new');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('picking a command runs it as an intent and clears the query', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.palette-item[data-command="zen-mode"]');
    await page.click('.palette-item[data-command="zen-mode"]');

    await page.waitForFunction(
      () => document.querySelector('.palette-shell .palette-log')?.textContent === 'ran: zen-mode',
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent runs a command from the same list', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.palette-item');
    await page.waitForSelector('.tool-row:has-text("palette.run") button');

    const example = await page.locator('.tool-row:has-text("palette.run") code.example').textContent();
    const target = JSON.parse(example ?? '{}');

    await page.click('.tool-row:has-text("palette.run") button');
    await page.waitForFunction(
      (id) => document.querySelector('.palette-shell .palette-log')?.textContent === `ran: ${id}`,
      target.id,
      { timeout: 5_000 },
    );
    // The id the agent sent is one a human could have clicked.
    expect(await page.locator(`.palette-item[data-command="${target.id}"]`).count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded clear stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.palette-item[data-command="archive"]');
    await page.click('.palette-item[data-command="archive"]');
    await page.waitForFunction(
      () => document.querySelector('.palette-shell .palette-log')?.textContent === 'ran: archive',
      null,
      { timeout: 5_000 },
    );

    await page.waitForSelector('.tool-row:has-text("palette.clear") button');
    await page.click('.tool-row:has-text("palette.clear") button');
    await page.waitForSelector('.proposal-card');
    expect(await log(page)).toBe('ran: archive');

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.palette-shell .palette-log')?.textContent === 'nothing run yet',
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
