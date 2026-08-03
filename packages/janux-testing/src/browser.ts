import type { Browser, Page } from 'playwright';

export type E2eBrowser = 'chromium' | 'firefox' | 'webkit';

/**
 * Which engine to drive, from JANUX_E2E_BROWSER — the CI matrix runs the same
 * suites on all three. Unset means Chromium on the branded Chrome channel,
 * which is what a developer's machine has installed and what these suites have
 * always run on. An unknown name is refused rather than quietly swapped for
 * another engine, because a matrix lane that silently retests Chrome is worse
 * than one that fails.
 */
export function launchTarget(name = process.env.JANUX_E2E_BROWSER): {
  browser: E2eBrowser;
  options: { channel?: string };
} {
  if (!name || name === 'chromium') return { browser: 'chromium', options: { channel: 'chrome' } };
  if (name === 'firefox' || name === 'webkit') return { browser: name, options: {} };

  throw new Error(`Unknown JANUX_E2E_BROWSER '${name}' — expected chromium, firefox or webkit.`);
}

let shared: Promise<Browser> | undefined;

/**
 * One browser for the whole test process. Launch/teardown churn across a dozen
 * suites is what made goto() flake under load; suites must NOT close this —
 * pages yes, the browser dies with the process. Playwright is imported lazily
 * so `@janux/testing` works without it until a browser is actually asked for.
 */
export function launchBrowser(): Promise<Browser> {
  const { browser, options } = launchTarget();

  shared ??= import('playwright').then((playwright) => playwright[browser].launch(options));

  return shared;
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
 * The page has booted its runtime, or finished parsing without one.
 *
 * `readyState` is the load-bearing half. Without it a document that has not
 * reached the runtime tag yet — a blank page, or one mid-navigation — answers
 * "no runtime declared", and the barrier that exists to catch unfinished work
 * reports quiet on a page that has not started. It must fail closed.
 */
function runtimeReady(): boolean {
  if (document.readyState !== 'complete') return false;

  return (
    'janux' in window ||
    !document.querySelector('script[key="jx-runtime"], script[key="jx-runtime-eager"]')
  );
}

/**
 * The quiescence barrier: resolves when the page's Janux runtime reports no
 * pending work — sources, effects, debounced intents, in-flight navigations,
 * suspense boundaries. This is the call that replaces every sleep: quiet is
 * observable, so waiting a guessed number of milliseconds is never needed.
 *
 * A page that ships no runtime (the 0-JS guarantee) is quiet by construction,
 * and `janux?.settled()` says so without a second round trip.
 */
export async function settled(page: Page, options: SettledOptions = {}): Promise<void> {
  const timeout = options.timeout ?? 10_000;

  await page.waitForFunction(runtimeReady, null, { timeout });
  // A `waitForFunction` predicate that returns a promise does not await it —
  // `evaluate` does, and `janux.settled()` is a promise.
  await page.waitForFunction(() => !document.querySelector('[data-jx-pending]'), null, { timeout });
  await page.evaluate(() => (window as unknown as { janux?: { settled(): Promise<void> } }).janux?.settled());
}

/** `page.goto` + the settled barrier: the page is interactive AND quiet when this resolves. */
export async function gotoSettled(page: Page, url: string, options: SettledOptions = {}): Promise<void> {
  await page.goto(url);
  await settled(page, options);
}
