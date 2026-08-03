import { chromium, firefox, webkit, type Browser } from 'playwright';

export type E2eBrowser = 'chromium' | 'firefox' | 'webkit';

const ENGINES = { chromium, firefox, webkit };

/**
 * Which engine this run drives, from the CI matrix's JANUX_E2E_BROWSER.
 * Unset means Chromium on the branded Chrome channel — what the suite has
 * always driven, and what a developer's machine has installed.
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
 * pages yes, the browser dies with the process.
 */
export function launchBrowser(): Promise<Browser> {
  const { browser, options } = launchTarget();

  shared ??= ENGINES[browser].launch(options);

  return shared;
}
