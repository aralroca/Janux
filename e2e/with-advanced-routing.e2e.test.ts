import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What examples/with-advanced-routing exists to demonstrate: the full route
 * grammar of the file-system router — dynamic, typed-matcher, catch-all and
 * optional catch-all segments, nested `_layout` chains and `(group)`
 * directories — plus SPA navigation between all of it.
 */

const APP = appRoot('examples/with-advanced-routing');
const BUILT = isBuilt(APP);
const UUID = '2b0d7b3d-8b8f-4a1e-9d3a-1c2e4f5a6b7c';

let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  app = await createTestApp(APP);
});

describe('examples/with-advanced-routing end to end', () => {
  it('renders a wiki article per [slug] param, title included', async () => {
    const html = await (await app.fetch('/wiki/routing')).text();

    expect(html).toContain('<title>Routing — Janux KB</title>');
    expect(html).toContain('the route-sort spec, not file order');
    expect(html).toContain('slug: <code>routing</code>');
    // Any single segment matches — even one with no article behind it.
    expect(await (await app.fetch('/wiki/definitely-not-written')).text()).toContain('Not written yet');
  });

  it('resolves deep catch-all routes and exposes the joined segments', async () => {
    const html = await (await app.fetch('/docs/guides/deploy/vercel')).text();

    expect(html).toContain('<title>Docs: guides/deploy/vercel — Janux KB</title>');
    expect(html).toContain('Docs / guides / deploy / vercel');
    expect(html).toContain('<span class="segment-count">3</span>');
    // Every breadcrumb is a shallower catch-all URL, and depth one still matches.
    expect(html).toContain('href="/docs/guides/deploy"');
    expect(await (await app.fetch('/docs/guides')).text()).toContain('<span class="segment-count">1</span>');
    // A catch-all needs at least one segment: bare /docs matches nothing.
    expect((await app.fetch('/docs')).status).toBe(404);
  });

  it('serves the optional catch-all with and without a rest', async () => {
    const bare = await (await app.fetch('/search')).text();
    const filtered = await (await app.fetch('/search/kind/article')).text();

    expect(bare).toContain('<title>Search — Janux KB</title>');
    expect(bare).toContain('No filters — the rest segment is optional.');
    expect(filtered).toContain('<title>Search: kind/article — Janux KB</title>');
    expect(filtered).toContain('2 filter(s) active.');
    expect(filtered).toContain('<code>kind</code>');
    expect(filtered).toContain('<code>article</code>');
  });

  it('gates /tickets by typed matchers: digits and uuids match, anything else 404s', async () => {
    const byNumber = await app.fetch('/tickets/123');
    const byUuid = await app.fetch(`/tickets/${UUID}`);

    expect(byNumber.status).toBe(200);
    expect(await byNumber.text()).toContain('Matched by the <code>integer</code> matcher.');
    expect(byUuid.status).toBe(200);
    expect(await byUuid.text()).toContain('Matched by the <code>uuid</code> matcher.');
    expect((await app.fetch('/tickets/abc')).status).toBe(404);
    expect((await app.fetch('/tickets/12.5')).status).toBe(404);
    expect((await app.fetch('/tickets/2b0d7b3d-8b8f-4a1e-9d3a')).status).toBe(404);
  });

  it('wraps each section in its own layout chain and no other', async () => {
    const wiki = await (await app.fetch('/wiki/islands')).text();
    const pricing = await (await app.fetch('/pricing')).text();
    const home = await (await app.fetch('/')).text();

    expect(wiki).toContain('data-shell="root"');
    expect(wiki).toContain('data-shell="wiki"');
    expect(wiki).not.toContain('data-shell="marketing"');
    expect(pricing).toContain('data-shell="root"');
    expect(pricing).toContain('data-shell="marketing"');
    expect(pricing).not.toContain('data-shell="wiki"');
    expect(home).toContain('data-shell="root"');
    expect(home).not.toContain('data-shell="wiki"');
    expect(home).not.toContain('data-shell="marketing"');
  });

  it('keeps the (marketing) group out of the URL', async () => {
    const pricing = await app.fetch('/pricing');

    expect(pricing.status).toBe(200);
    expect(await pricing.text()).toContain('From the marketing team');
    expect((await app.fetch('/about')).status).toBe(200);
    expect((await app.fetch('/(marketing)/pricing')).status).toBe(404);
    expect((await app.fetch('/marketing/pricing')).status).toBe(404);
  });

  it('404s a route no pattern matches, with the app\'s own page inside the shell', async () => {
    const response = await app.fetch('/nope');
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('<title>No such page — Janux KB</title>');
    expect(html).toContain('Nothing here');
    expect(html).toContain('data-shell="root"');
    expect((await app.fetch('/wiki/too/deep')).status).toBe(404);
  });

  it('answers a page that throws with _500, alone — no shell around it', async () => {
    const response = await app.fetch('/boom');
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('Something broke');
    expect(html).not.toContain('data-shell="root"');
  });
});

let base = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: base, stop } = await startTestServer(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

describe.skipIf(!BUILT)('examples/with-advanced-routing SPA navigation in the browser', () => {
  it('navigates section to section without a reload; the shell island keeps its count', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(`${base}/wiki/routing`);
    await page.waitForSelector('[data-shell="wiki"]');
    await page.click('.nav-counter');
    await page.waitForFunction(() => document.querySelector('.nav-counter')?.textContent?.includes('1'), null, {
      timeout: 5_000,
    });
    await page.evaluate(() => {
      (window as any).__kbNoReload = true;
    });

    await page.click('header nav a[href="/pricing"]');
    await page.waitForSelector('[data-shell="marketing"]');
    // Same document (the marker survived), same island state, new URL and sub-shell.
    expect(new URL(page.url()).pathname).toBe('/pricing');
    expect(await page.evaluate(() => (window as any).__kbNoReload)).toBe(true);
    expect(await page.textContent('.nav-counter')).toContain('1');
    expect(await page.locator('[data-shell="wiki"]').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
