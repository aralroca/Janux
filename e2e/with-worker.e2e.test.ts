import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * `worker()` against the with-worker example. The assertion that matters is not
 * "the number came back" — it is that the main thread stayed free while it did.
 * A ticker outside the island measures exactly that, so the difference between
 * the two buttons is observable rather than asserted by faith.
 */

const BUILT = isBuilt(appRoot('examples/with-worker'));
/** π(10⁷): the preset the page loads with. */
const PRIMES_BELOW_10M = 664579;

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(appRoot('examples/with-worker')));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

const ticks = (page: Page) => page.textContent('#ticker').then((text) => Number(text));

/** Runs one of the two buttons and reports how far the ticker got while it ran. */
async function run(page: Page, button: 'worker' | 'main') {
  const before = await ticks(page);

  await page.click(`.run.${button}`);
  await page.waitForSelector(`.result[data-thread="${button}"] strong`, { timeout: TIMEOUT });

  return { advanced: (await ticks(page)) - before, primes: await page.getAttribute('.result', 'data-primes') };
}

async function openLab(): Promise<{ page: Page; errors: string[] }> {
  const opened = await openPage(browser!);

  await opened.page.goto(BASE);
  await opened.page.waitForSelector('.lab');
  // Let the ticker start before anything is measured against it.
  await opened.page.waitForTimeout(300);

  return opened;
}

describe('worker SSR (examples/with-worker)', () => {
  it('renders the lab and the ticker on the server', async () => {
    const app = await createTestApp(appRoot('examples/with-worker'));
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('id="ticker"');
    expect(html).toContain('data-limit="10000000"');
    expect(html).toContain('Count on a worker');
    expect(html).toContain('data-primes="0"');
  });
});

describe.skipIf(!BUILT)('worker() in Chrome (examples/with-worker)', () => {
  it('counts the primes off the main thread, leaving the page interactive', async () => {
    const { page, errors } = await openLab();
    const worker = await run(page, 'worker');

    expect(worker.primes).toBe(String(PRIMES_BELOW_10M));
    // ~1.9s of work against a 100ms ticker: a free main thread advances it many
    // times over. The floor is deliberately far below that to stay honest on a
    // loaded CI box, while still being unreachable by a frozen page.
    expect(worker.advanced).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  }, TIMEOUT);

  it('freezes the page when the same function runs on the main thread', async () => {
    const { page, errors } = await openLab();
    const main = await run(page, 'main');

    expect(main.primes).toBe(String(PRIMES_BELOW_10M));
    expect(main.advanced).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  }, TIMEOUT);

  it('agrees on the answer for a different workload', async () => {
    const { page, errors } = await openLab();

    await page.click('[data-limit="5000000"]');
    const worker = await run(page, 'worker');

    expect(worker.primes).toBe('348513');
    expect(errors).toEqual([]);
  }, TIMEOUT);
});
