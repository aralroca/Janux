import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { gotoSettled, isBuilt, launchBrowser, openPage, settled, startTestServer } from '@janux/testing';
import { build } from '../packages/janux-cli/src/commands';
import { compressions } from '../packages/janux-cli/src/static-assets';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The claim `examples/with-offline` makes, checked against a real browser with
 * its network genuinely switched off: after one visit the app opens with no
 * connection, and the deploy after that reaches it without anyone closing a tab.
 *
 * Chromium only, and deliberately so. Playwright's WebKit build ships no
 * service worker support at all, and its Firefox does not honour
 * `context.setOffline` for worker-mediated fetches — both are properties of the
 * automation build rather than of the engine, so a suite that ran there would
 * report on Playwright and not on Janux. The engine-independent half (the
 * script is emitted, the manifest is right) is asserted from the build output,
 * which every lane reads.
 */

const ROOT = appRoot('examples/with-offline');
const DIST = join(ROOT, 'dist/client');
const MARKER = join(ROOT, 'public/deploy-marker.txt');
const BUILT = isBuilt(ROOT);
/** `launchTarget`'s own source of truth — see `@janux/testing`'s browser.ts. */
const CHROMIUM = !process.env.JANUX_E2E_BROWSER || process.env.JANUX_E2E_BROWSER === 'chromium';
const DRIVES = BUILT && CHROMIUM;

/**
 * Registered only where the automation build can drive a service worker (see
 * the header). Registration, not `skipIf`: a skipped row would count
 * Playwright's gaps against Janux's suite on every non-chromium lane.
 */
const drivingIt = (DRIVES ? it : () => {}) as typeof it;

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!DRIVES) return;
  const server = await startTestServer(ROOT);

  BASE = server.url;
  stop = server.stop;
  browser = await launchBrowser();
});

afterAll(() => {
  stop?.();
  rmSync(MARKER, { force: true });
});

/**
 * Polls until the predicate holds.
 *
 * Every other wait in this suite is `settled()`, because Janux publishes its
 * own quiescence. The service worker lifecycle publishes nothing comparable —
 * install, activate and claim are the browser's, not the app's — so the honest
 * thing is a bounded poll rather than a guessed sleep.
 *
 * A read that throws is retried rather than fatal: the thing being waited for
 * is a worker taking over, and taking over reloads the page, which destroys the
 * execution context an in-flight `evaluate` was running in. Failing there would
 * mean failing precisely because the update worked.
 */
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, what: string): Promise<T> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const value = await read().catch(() => undefined);

    if (value !== undefined && holds(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`with-offline: timed out waiting for ${what}`);
}

/** The Janux caches this origin holds, which are named after the build they came from. */
function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys().then((keys) => keys.filter((key) => key.startsWith('janux-'))));
}

/** Whether any cache holds a response for this URL — the page's own copy included. */
function cached(page: Page, url: string): Promise<boolean> {
  return page.evaluate(async (target) => {
    const keys = await caches.keys();
    const hits = await Promise.all(keys.map((key) => caches.open(key).then((cache) => cache.match(target))));

    return hits.some(Boolean);
  }, url);
}

/** A page that has loaded, been claimed by the worker, and had its own URL cached. */
async function visitAndInstall(url: string): Promise<{ page: Page; errors: string[] }> {
  const opened = await openPage(browser!);
  const controlled = () => opened.page.evaluate(() => Boolean(navigator.serviceWorker.controller));

  await gotoSettled(opened.page, url);
  await until(controlled, Boolean, 'the worker to take control');
  await until(() => cached(opened.page, url), Boolean, 'the visited page to be cached');

  return opened;
}

/** A new deploy: change something the build emits, rebuild, and forget the compressed bodies. */
async function deploy(marker?: string): Promise<void> {
  if (marker === undefined) rmSync(MARKER, { force: true });
  else writeFileSync(MARKER, marker);
  await build({ root: ROOT });
  // `janux start` memoises compressed bodies per path for the life of the
  // process, which a real deploy ends. This suite rebuilds under a server that
  // keeps running, so it has to say so itself.
  compressions.clear();
}

describe('examples/with-offline build output', () => {
  it.skipIf(!BUILT)('registers the worker from prerendered files, with no server in the picture', () => {
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');

    expect(home).toContain('key="jx-sw"');
    expect(home).toContain('"/sw.js"');
  });

  it.skipIf(!BUILT)('precaches the build output and never a document', () => {
    const worker = readFileSync(join(DIST, 'sw.js'), 'utf8');

    expect(worker).toContain('/client.js');
    expect(worker).toContain('/styles.css');
    expect(worker).not.toContain('/index.html');
    expect(worker).not.toContain('client.js.map');
  });
});

describe('examples/with-offline with the network switched off', () => {
  drivingIt(
    'opens a page it has already seen',
    async () => {
      const { page, errors } = await visitAndInstall(`${BASE}/`);

      await page.context().setOffline(true);
      await page.reload();
      await settled(page);

      expect(await page.textContent('h1')).toBe('Basecamp');
      expect(errors).toEqual([]);
      await page.context().setOffline(false);
      await page.close();
    },
    TIMEOUT,
  );

  drivingIt(
    'is usable and not merely visible: the island boots from the cache too',
    async () => {
      const { page } = await visitAndInstall(`${BASE}/`);

      await page.context().setOffline(true);
      await page.reload();
      await settled(page);
      await page.click('[data-item="Whistle"]');
      await settled(page);

      expect(await page.getAttribute('[data-item="Whistle"]', 'aria-pressed')).toBe('true');
      expect(await page.getAttribute('.tally output', 'data-packed')).toBe('1');
      await page.context().setOffline(false);
      await page.close();
    },
    TIMEOUT,
  );

  drivingIt(
    'answers a page it never saw with the offline notice, not a browser error',
    async () => {
      const { page } = await visitAndInstall(`${BASE}/`);

      await page.context().setOffline(true);
      await page.goto(`${BASE}/never-opened`);

      expect(await page.textContent('h1')).toBe('No connection');
      await page.context().setOffline(false);
      await page.close();
    },
    TIMEOUT,
  );
});

describe('examples/with-offline across a deploy', () => {
  drivingIt(
    'moves an open page to the new build and drops the previous one',
    async () => {
      const { page } = await visitAndInstall(`${BASE}/`);
      const before = await cacheNames(page);
      const tookOver = (names: string[]) => names.length === 1 && names[0] !== before[0];

      await deploy('shipped');
      await page.reload();
      const after = await until(() => cacheNames(page), tookOver, 'the new build to take over');

      // One cache, and it is not the one from before: the visitor is on the new
      // deploy and the old bytes are not lingering behind them.
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(1);
      await settled(page);
      expect(await page.textContent('h1')).toBe('Basecamp');
      await page.close();
    },
    TIMEOUT * 3,
  );

  drivingIt(
    'still works offline once the new build has taken over',
    async () => {
      await deploy();
      const { page } = await visitAndInstall(`${BASE}/`);

      await page.context().setOffline(true);
      await page.reload();
      await settled(page);

      expect(await page.textContent('h1')).toBe('Basecamp');
      await page.context().setOffline(false);
      await page.close();
    },
    TIMEOUT * 3,
  );
});
