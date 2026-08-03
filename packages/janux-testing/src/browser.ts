import type { Browser, Page } from 'playwright';

let sharedChrome: Promise<Browser> | undefined;

/**
 * One Chrome for the whole test process. Launch/teardown churn across a dozen
 * suites is what made goto() flake under load; suites must NOT close this —
 * pages yes, the browser dies with the process. Playwright is imported lazily
 * so `@janux/testing` works without it until a browser is actually asked for.
 */
export function launchChrome(): Promise<Browser> {
  sharedChrome ??= import('playwright').then(({ chromium }) => chromium.launch({ channel: 'chrome' }));

  return sharedChrome;
}

/** New page that records uncaught page errors for the final assertion. */
export async function openPage(browser: Browser): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));

  return { page, errors };
}

export interface SettledOptions {
  timeout?: number;
}

/**
 * The quiescence barrier: resolves when the page's Janux runtime reports no
 * pending work — sources, effects, debounced intents, in-flight navigations,
 * suspense boundaries. This is the call that replaces every sleep: quiet is
 * observable, so waiting a guessed number of milliseconds is never needed.
 */
export async function settled(page: Page, options: SettledOptions = {}): Promise<void> {
  const timeout = options.timeout ?? 10_000;

  await page.waitForFunction(() => Boolean((window as unknown as { janux?: unknown }).janux), null, { timeout });
  // A `waitForFunction` predicate that returns a promise does not await it —
  // `evaluate` does, and `janux.settled()` is a promise.
  await page.waitForFunction(() => !document.querySelector('[data-jx-pending]'), null, { timeout });
  await page.evaluate(() => (window as unknown as { janux: { settled(): Promise<void> } }).janux.settled());
}

/** `page.goto` + the settled barrier: the page is interactive AND quiet when this resolves. */
export async function gotoSettled(page: Page, url: string, options: SettledOptions = {}): Promise<void> {
  await page.goto(url);
  await settled(page, options);
}
