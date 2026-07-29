import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/data-cache exists to demonstrate: the catalog filter lives in
 * the URL (`urlState` with `replace: false`), so filtering is deep-linkable and
 * every filter is a history entry the Back button undoes — while `useQuery`
 * keeps the product fetches cached per tag. Only a real browser has a URL bar
 * and a history stack, hence the built-app half of this suite.
 */

const APP = 'examples/data-cache';
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);

const items = (page: Page) => page.locator('.catalog .item').allTextContents();
const waitForCount = (page: Page, total: number) =>
  page.waitForFunction(
    (expected) => document.querySelector('.catalog .count')?.textContent === `total:${expected}`,
    total,
    { timeout: 10_000 },
  );

describe('examples/data-cache server side', () => {
  it('ships the filter UI from the server, query pending until the client resumes', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<title>Janux — data cache &amp; URL state</title>');
    ['all', 'input', 'display', 'video'].forEach((tag) => expect(html).toContain(`>${tag}</button>`));
    expect(html).toContain('class="tag on"');
    expect(html).toContain('Loading…');
  });

  it('exposes the filter intent and the products api as agent tools', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['catalog.filter']).toBe('auto');
    expect(guards['api.products.listProducts']).toBe('auto');
  });
});

describe.skipIf(!BUILT)('examples/data-cache in the browser', () => {
  it('loads unfiltered: every product renders and the URL stays clean', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await waitForCount(page, 4);
    expect(await items(page)).toEqual(['Keyboard', 'Mouse', 'Monitor', 'Webcam']);
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('filtering writes ?tag= into the URL and narrows the list', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await waitForCount(page, 4);
    await page.click('.tags button:has-text("video")');
    await waitForCount(page, 1);
    expect(await items(page)).toEqual(['Webcam']);
    expect(new URL(page.url()).search).toBe('?tag=video');
    expect(await page.locator('.tags button:has-text("video")').getAttribute('class')).toBe('tag on');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('deep link: /?tag=video renders already filtered, with the tag selected', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/?tag=video`);
    await waitForCount(page, 1);
    expect(await items(page)).toEqual(['Webcam']);
    expect(await page.locator('.tags button:has-text("video")').getAttribute('class')).toBe('tag on');

    // The deep link is state, not a dead end: switching back to `all` refetches.
    await page.click('.tags button:has-text("all")');
    await waitForCount(page, 4);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the panel example payload for catalog.filter really drives the filter', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await waitForCount(page, 4);
    // Filter as a human first, so the agent call has something to change.
    await page.click('.tags button:has-text("video")');
    await waitForCount(page, 1);

    // The payload shown next to the tool is what the button sends — it must
    // name a real tag, not a placeholder the filter can never match.
    const example = await page.locator('.tool-row:has-text("catalog.filter") code.example').textContent();
    const target = JSON.parse(example ?? '{}').tag;

    const inTag: Record<string, number> = { all: 4, input: 2, display: 1, video: 1 };

    await page.click('.tool-row:has-text("catalog.filter") button');
    await waitForCount(page, inTag[target]!);
    expect(await page.locator(`.tags .tag.on`).textContent()).toBe(target);
    // The agent's filter flows into the URL exactly like a click does — and
    // the fallback tag clears the param instead of pinning ?tag=all.
    expect(new URL(page.url()).searchParams.get('tag')).toBe(target === 'all' ? null : target);
    // The resource the agent reads back agrees with the view it just changed.
    await page.waitForFunction(
      (tag) => document.querySelector('.resource')?.textContent?.includes(`"tag": "${tag}"`),
      target,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('calling a read-only api tool shows its result instead of looking dead', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await waitForCount(page, 4);

    // A server tool that only reads changes nothing on the page, so the panel
    // is the only place its answer can show — otherwise the button looks broken.
    await page.click('.tool-row:has-text("api.products.listProducts") button');
    await page.waitForSelector('.tool-row:has-text("api.products.listProducts") .tool-result', { timeout: 5_000 });
    const result = await page.locator('.tool-row:has-text("api.products.listProducts") .tool-result').textContent();

    expect(result).toContain('Keyboard');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('Back undoes filters one by one: replace:false made each a history entry', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await waitForCount(page, 4);
    await page.click('.tags button:has-text("video")');
    await waitForCount(page, 1);
    await page.click('.tags button:has-text("input")');
    await waitForCount(page, 2);
    expect(await items(page)).toEqual(['Keyboard', 'Mouse']);

    await page.goBack();
    await waitForCount(page, 1);
    expect(new URL(page.url()).search).toBe('?tag=video');
    expect(await items(page)).toEqual(['Webcam']);

    await page.goBack();
    await waitForCount(page, 4);
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
