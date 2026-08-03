import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { type Browser, type Page } from 'playwright';
import { createJanuxServer } from '../packages/janux-server/src/index';
import { prodServerOptions } from '../packages/janux-cli/src/prod';
import { staticResponse } from '../packages/janux-cli/src/static-assets';
import { TIMEOUT, appRoot, isBuilt, launchBrowser } from './support/app';

/**
 * Navigation in a real browser, against the real docs app.
 *
 * The unit suites run on happy-dom, which has no incremental HTML tokenizer and
 * no Navigation API — so the two things this file exists for (a page applied as
 * it streams, and rapid navigations superseding each other) can only be
 * verified in an engine. Chrome is the engine that has both.
 */

const APP_ROOT = appRoot('apps/docs');
const BUILT = isBuilt('apps/docs');
const FIRST = '/docs/getting-started/what-is-janux';
const SECOND = '/docs/getting-started/quick-start';
const THIRD = '/docs/getting-started/mental-model';

let server: ReturnType<typeof Bun.serve> | undefined;
let browser: Browser | undefined;

/**
 * `/slow/<path>` serves the real page in two chunks with a pause between them.
 * A buffered client shows nothing until the second chunk; a streaming one
 * paints the first one during the pause — the difference this whole feature is
 * about, and it needs a real tokenizer to observe.
 *
 * The cut goes a few paragraphs PAST the article heading (which sits ~68% into
 * this page, well after the sidebar): the walker holds the last node of a chunk
 * until a sibling proves it complete, so a boundary right after `</h1>` would
 * leave the heading itself pending.
 */
const CHUNK_PAUSE_MS = 2_500;

let BASE = '';

function slowProxy(app: ReturnType<typeof createJanuxServer>) {
  // The client bundle lives on disk, like `janux start` serves it — without it
  // no island ever mounts and there is no SPA navigation to test.
  const staticDir = join(APP_ROOT, 'dist/client');
  const serve = async (req: Request) => (await staticResponse(staticDir, req)) ?? app.fetch(req);

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (!url.pathname.startsWith('/slow/')) return serve(req);
    const target = new Request(`${url.origin}${url.pathname.slice('/slow'.length)}${url.search}`, req);
    const html = await (await serve(target)).text();
    const heading = html.indexOf('</h1>');
    const cut = heading === -1 ? Math.floor(html.length / 2) : heading + 2_000;
    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(html.slice(0, cut)));
          await Bun.sleep(CHUNK_PAUSE_MS);
          controller.enqueue(encoder.encode(html.slice(cut)));
          controller.close();
        },
      }),
      // Without no-store the second test gets Chrome's heuristically cached
      // copy — instantly, pause and all, and the race it sets up never happens.
      { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    );
  };
}

beforeAll(async () => {
  if (!BUILT) return;
  const app = createJanuxServer(await prodServerOptions(APP_ROOT));

  server = Bun.serve({ port: 0, fetch: slowProxy(app) });
  BASE = `http://localhost:${server.port}`;
  // Chrome proper, not the bundled Chromium: the Navigation API and speculation
  // rules are what this suite exercises, and it is the engine that ships both.
  browser = await launchBrowser();
});

afterAll(async () => {
  server?.stop(true);
});

async function openDocsWithAssistant(): Promise<{ page: Page; errors: string[] }> {
  const page = await browser!.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}${FIRST}`, { waitUntil: 'networkidle' });
  await page.locator('.copilot-toggle').click();
  await page.waitForSelector('janux-island[data-jx-persist] input');
  // Tag the live node: proving the SAME element survived is the whole point —
  // a re-rendered copy would look identical and be a different instance.
  await page.evaluate(() => {
    (document.querySelector('janux-island[data-jx-persist]') as any).__probe = 'live';
  });

  return { page, errors };
}

const assistantState = (page: Page) =>
  page.evaluate(() => {
    const node = document.querySelector('janux-island[data-jx-persist]') as any;

    return {
      exists: !!node,
      sameInstance: node?.__probe === 'live',
      open: !!node?.querySelector('input'),
    };
  });

/** The sidebar renders twice (a mobile `details` and the desktop nav); only one is clickable. */
const sidebarLink = (page: Page, href: string) => page.locator(`a[href="${href}"]:visible`).first();

describe.skipIf(!BUILT)('navigation in a real browser (apps/docs)', () => {
  it('applies a navigation as it streams: the new heading paints before the page ends', async () => {
    const { page } = await openDocsWithAssistant();
    const navigation = page.evaluate((path) => (window as any).janux.navigate(path), `/slow${SECOND}`);

    // Halfway through the pause: the tail of the page provably has not
    // arrived. The marker lives near the end of Quick start and appears
    // nowhere on the page navigated from.
    const TAIL_MARKER = 'Make your first change';

    await page.waitForTimeout(CHUNK_PAUSE_MS / 2);
    const midStream = await page.evaluate((marker) => ({
      heading: document.querySelector('h1')?.textContent ?? '',
      tailLanded: !!document.body.textContent?.includes(marker),
    }), TAIL_MARKER);

    await navigation;

    expect(midStream.heading).toContain('Quick start');
    expect(midStream.tailLanded).toBe(false);
    // And the rest of the page did land, once its chunk arrived.
    expect(await page.evaluate((marker) => document.body.textContent?.includes(marker), TAIL_MARKER)).toBe(true);
    await page.close();
  }, TIMEOUT);

  it('keeps a persisted island alive, and open, across a navigation', async () => {
    const { page, errors } = await openDocsWithAssistant();

    await sidebarLink(page, SECOND).click();
    await page.waitForFunction((path) => location.pathname === path, SECOND);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Quick start'));

    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  /**
   * Clicking through a sidebar faster than the pages arrive: every superseded
   * navigation must lose to the last one — no half-applied page, no assistant
   * lost to a race, and the URL, the title and the content all agreeing. The
   * first target is the slow one, so it is provably still in flight when the
   * second click lands.
   */
  it('rapid navigations: the last one wins and the earlier ones are dropped', async () => {
    const { page, errors } = await openDocsWithAssistant();

    await page.evaluate(() => {
      (window as any).__phases = [];
      document.addEventListener('janux:navigate', (event: any) => {
        (window as any).__phases.push(`${event.detail.phase}:${new URL(event.detail.to).pathname}`);
      });
    });
    const superseded = page
      .evaluate((path) => (window as any).janux.navigate(path), `/slow${SECOND}`)
      .catch(() => {});

    await page.waitForFunction(() => (window as any).__phases.length > 0);
    await sidebarLink(page, THIRD).click();
    await page.waitForFunction((path) => location.pathname === path, THIRD);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Mental model'));
    // The h1 lands mid-diff; `after:` only fires when the whole diff completes.
    await page.waitForFunction((path) => (window as any).__phases.includes(`after:${path}`), THIRD);
    await superseded;

    const phases: string[] = await page.evaluate(() => (window as any).__phases);

    // The superseded navigation started and never completed; the last one did.
    expect(phases).toContain(`before:/slow${SECOND}`);
    expect(phases).not.toContain(`after:/slow${SECOND}`);
    expect(phases).toContain(`after:${THIRD}`);
    expect(await page.title()).toContain('Mental model');
    expect(await assistantState(page)).toEqual({ exists: true, sameInstance: true, open: true });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('never accumulates duplicate stylesheets while navigating', async () => {
    const { page } = await openDocsWithAssistant();
    const styleCount = () =>
      page.evaluate(() => document.querySelectorAll('head style, head link[rel="stylesheet"]').length);
    const before = await styleCount();

    await sidebarLink(page, SECOND).click();
    await page.waitForFunction((path) => location.pathname === path, SECOND);
    await sidebarLink(page, THIRD).click();
    await page.waitForFunction((path) => location.pathname === path, THIRD);

    expect(await styleCount()).toBe(before);
    await page.close();
  }, TIMEOUT);

  /**
   * The rule styles/dark-mode.md tells readers to follow. diff-dom-streaming
   * deliberately never overwrites BODY attributes, and diffs every other
   * element — so runtime display state (theme, density) survives a navigation
   * on `<body>` and is silently reset on `<html>`. Documenting that is only
   * safe while it stays true, which is what this asserts.
   *
   * https://github.com/brisa-build/diff-dom-streaming#strong-opinion-on-body-tag-attributes-during-diffing
   */
  it('preserves body attributes across a navigation, but not html ones', async () => {
    const page = await browser!.newPage();

    await page.goto(`${BASE}${FIRST}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.body.dataset.theme = 'dark';
      document.body.classList.add('probe-class');
      document.documentElement.dataset.theme = 'dark';
    });

    await sidebarLink(page, SECOND).click();
    await page.waitForFunction((path) => location.pathname === path, SECOND);

    expect(
      await page.evaluate(() => ({
        body: document.body.dataset.theme,
        bodyClass: document.body.classList.contains('probe-class'),
        html: document.documentElement.dataset.theme ?? null,
      })),
    ).toEqual({ body: 'dark', bodyClass: true, html: null });
    await page.close();
  }, TIMEOUT);
});
