import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/hacker-news exists to demonstrate: the canonical HN clone on
 * streaming SSR. The story list is a suspense island over a deliberately slow
 * (but deterministic, fully local) fixture, so the same response carries the
 * skeleton first and the ranked list later; pagination and the item page are
 * plain routes; the comment tree arrives fully server-rendered; and hovering
 * a link warms the destination stream before the click.
 */

const APP = 'examples/hacker-news';
const BUILT = isBuilt(APP);

/** Fixture facts (src/data/stories.ts is pure formulas, so these are stable). */
const TITLE_1 = 'Show HN: A text editor that fits in 4 KB of WebAssembly';
const TITLE_11 = 'Postgres as a message queue was the right call';
const TITLE_21 = 'Debugging a race that only happened on Fridays';

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

/**
 * Idle: the navigation itself has finished (the runtime tracks it in `inflight`,
 * which `janux.settled()` drains) and no suspense boundary is still pending.
 *
 * The pending marker alone is not idle. A streamed page arrives head first, so
 * between its `<title>` landing and its body landing the document holds the new
 * title and none of the new content — and no pending marker either, because the
 * skeleton that carries it has not arrived yet. Waiting on the marker alone
 * returns in that window and asserts against the *outgoing* page.
 */
const settled = async (page: Page) => {
  // The navigation first — the runtime tracks it in `inflight`, which this
  // drains. Waiting on the pending marker alone returns in the window between a
  // streamed page's <title> landing and its body: the document then holds the
  // new title, none of the new content, and no pending marker either, because
  // the skeleton that carries one has not arrived yet. (`evaluate` awaits the
  // promise; a `waitForFunction` predicate that returns one does not — it reads
  // the promise itself as truthy and resolves after a single poll.)
  await page.evaluate(() => (window as any).janux?.settled?.());
  await page.waitForFunction(() => !document.querySelector('[data-jx-pending]'), null, { timeout: 10_000 });
};
/** Interception and hover-prefetch exist once `boot()` ran (the interlude ships it mid-stream). */
const booted = (page: Page) =>
  page.waitForFunction(() => Boolean((window as any).janux), null, { timeout: 10_000 });

describe('examples/hacker-news server side', () => {
  it('streams the front page: skeleton first, the ranked stories later in the same response', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    // Both live in one response: the inline fallback and the trailing swap chunk.
    expect(html).toContain('data-jx-pending');
    expect(html).toContain('class="story skeleton"');
    expect(html).toContain(`>${TITLE_1}</a>`);
    // Stream order is the proof: the skeleton went out before the content existed.
    expect(html.indexOf('class="story skeleton"')).toBeLessThan(html.indexOf(`>${TITLE_1}</a>`));
    expect(html).toContain('<title>Janux HN — the front page</title>');
  });

  it('paginates: /news/2 renders the second ten stories, not the first page', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/news/2')).text();

    expect(html).toContain('<title>Janux HN — page 2</title>');
    expect(html).toContain(`>${TITLE_11}</a>`);
    expect(html).toContain('<span class="rank">11.</span>');
    // Page-1 stories are absent as rendered rows (they exist only in the source snapshot).
    expect(html).not.toContain(`>${TITLE_1}</a>`);
    expect((await (await get('/news/3')).text())).toContain(`>${TITLE_21}</a>`);
  });

  it('item/[id]: the nested comment tree arrives fully server-rendered, parent before child', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/item/1')).text();

    expect(html).toContain(`<title>${TITLE_1} — Janux HN</title>`);
    ['(c1-1)', '(c1-1-1)', '(c1-1-1-1)'].forEach((marker) => expect(html).toContain(marker));
    // Document order mirrors the hierarchy: each reply streams inside its parent.
    expect(html.indexOf('(c1-1)')).toBeLessThan(html.indexOf('(c1-1-1)'));
    expect(html.indexOf('(c1-1-1)')).toBeLessThan(html.indexOf('(c1-1-1-1)'));
    // Comments are static markup — nothing on this page is left pending.
    expect(html).not.toContain('data-jx-pending');
  });

  it('item/[id]: an id that matches the matcher but no story is a 404', async () => {
    const { get } = await ssrApp(APP);
    const response = await get('/item/999');

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('No such page');
  });

  it('exposes the fixture apis and the mounted intents as agent tools', async () => {
    const { get } = await ssrApp(APP);
    const toolGuards = async (path: string) => {
      const manifest: any = await (await get(`/_janux/manifest?path=${encodeURIComponent(path)}`)).json();

      return Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));
    };
    const front = await toolGuards('/');
    const item = await toolGuards('/item/1');

    expect(front['api.hn.listStories']).toBe('auto');
    expect(front['api.hn.getItem']).toBe('auto');
    expect(front['search-box.search']).toBe('auto');
    // The manifest is per-page: the score island only mounts on item pages.
    expect(item['live-score.refresh']).toBe('auto');
  });
});

describe.skipIf(!BUILT)('examples/hacker-news in the browser', () => {
  it('first load: the skeleton paints mid-stream, then the ranked list swaps in', async () => {
    const { page, errors } = await openPage();
    const navigation = page.goto(`${BASE}/`, { waitUntil: 'commit' });

    // Mid-stream: the response is still open, yet the fallback already painted.
    await page.waitForSelector('janux-island[data-jx-pending]', { timeout: 5_000 });
    expect(await page.locator('.story.skeleton').count()).toBeGreaterThan(0);

    await navigation;
    await settled(page);
    expect(await page.locator('.story-link').count()).toBe(10);
    expect(await page.locator('.story-link').first().textContent()).toBe(TITLE_1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('index → item → back is a diff, not a reload, with the right titles', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await settled(page);
    await booted(page);
    await page.click(`.story-link[href="/item/1"]`);
    await page.waitForFunction(
      (expected) => document.title === `${expected} — Janux HN`,
      TITLE_1,
      { timeout: 10_000 },
    );

    // The comment hierarchy is live DOM nesting, straight from the server markup.
    expect(await page.locator('.comment .comment .comment').count()).toBeGreaterThan(0);

    await page.goBack();
    await page.waitForFunction(() => document.title === 'Janux HN — the front page', null, {
      timeout: 10_000,
    });
    await settled(page);
    expect(await page.locator('.story-link').count()).toBe(10);
    // One navigation entry across the whole trip: every hop was a streamed diff.
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('More › paginates as a streamed diff: page 2 swaps in, Prev restores page 1', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await settled(page);
    await booted(page);
    await page.click('.pager-more');

    // The island key changes across pages (story-list#1 → story-list#2): the
    // diff inserts a NEW island and its boundary chunk must still swap in.
    await page.waitForFunction(() => document.title === 'Janux HN — page 2', null, { timeout: 10_000 });
    await page.waitForFunction(
      (expected) => [...document.querySelectorAll('.story-link')].some((a) => a.textContent === expected),
      TITLE_11,
      { timeout: 10_000 },
    );
    expect(await page.locator('.story-link').count()).toBe(10);
    expect(await page.locator('.rank').first().textContent()).toBe('11.');

    await page.click('.pager-prev');
    await page.waitForFunction(
      (expected) => [...document.querySelectorAll('.story-link')].some((a) => a.textContent === expected),
      TITLE_1,
      { timeout: 10_000 },
    );
    expect(await page.locator('.rank').first().textContent()).toBe('1.');
    // One navigation entry across the whole trip: both hops were streamed diffs.
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('hovering a link warms the next page: a prefetch request, no navigation', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await settled(page);
    await booted(page);
    const prefetched = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/news/2' &&
        request.headers()['x-janux-navigation'] === '1',
      { timeout: 5_000 },
    );

    await page.hover('.pager-more');
    await prefetched;
    // It was a warm-up, not a click: the page did not move.
    expect(new URL(page.url()).pathname).toBe('/');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
