import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { TIMEOUT, appRoot, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * examples/agent-evals exists to prove the CI gate itself: `janux eval` replays
 * scripted agent tasks (tool calls + a human approval) over the real HTTP agent
 * surface with no model anywhere, and its exit code is the merge gate. This
 * suite runs the real CLI the way the agent-evals-in-ci recipe wires it in CI
 * (`--start`/`--url`/`--json`), proves red is reachable via a must-fail canary,
 * and checks the description contract with `janux verify`.
 */

const EXAMPLE = appRoot('examples/agent-evals');
const SHOP = appRoot('examples/shop');
const CLI_TIMEOUT = 120_000;
const BUILT = isBuilt('examples/agent-evals');

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt('examples/agent-evals'));
  browser = await launchChrome();
});

afterAll(() => {
  stop?.();
});

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

interface StepReport {
  label: string;
  pass: boolean;
  detail?: string;
}

interface ScenarioReport {
  name: string;
  pass: boolean;
  steps: StepReport[];
}

function runJanux(cwd: string, args: string[]): CliRun {
  const proc = Bun.spawnSync(['bunx', 'janux', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });

  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** The recipe's CI shape: `eval --start` boots the app, runs every scenario, stops it. */
function evalArgs(port: number, files: string[] = []): string[] {
  return ['eval', ...files, '--json', '--start', `bunx janux start --port ${port}`, '--url', `http://localhost:${port}`];
}

/** Under `--json` the child app's stdout is silenced, so the report is the whole stdout. */
function reportsFrom(stdout: string): ScenarioReport[] {
  return JSON.parse(stdout);
}

describe('examples/agent-evals — janux eval as the CI gate', () => {
  it(
    'serves the stockroom SSR and a manifest with the expected mixed guards',
    async () => {
      const { get } = await ssrApp('examples/agent-evals');
      const html = await (await get('/')).text();

      expect(html).toContain('Warehouse');
      expect(html).toContain('TSHIRT');
      expect(html).toContain('Ceramic Mug');

      const manifest: any = await (await get('/_janux/manifest')).json();
      const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

      expect(guards).toEqual({
        'stockroom.restock': 'auto',
        'stockroom.writeOff': 'confirm',
        'api.stock.levels': 'auto',
        'api.stock.restock': 'auto',
        'api.stock.discard': 'confirm',
      });
    },
    CLI_TIMEOUT,
  );

  it(
    'janux eval --json exits 0 and every scripted agent task passes, approval and rejection included',
    () => {
      const run = runJanux(EXAMPLE, evalArgs(4761));
      const reports = reportsFrom(run.stdout);
      const labels = reports.flatMap((report) => report.steps.map((step) => step.label));

      expect(run.code).toBe(0);
      // Pure JSON on stdout: the booted app's logs are silenced under --json.
      expect(run.stdout.trimStart().startsWith('[')).toBe(true);
      expect(reports.map((report) => report.pass)).toEqual([true, true, true, true]);
      // Deterministic order: the evals/ glob runs sorted by filename.
      expect(reports.map((report) => report.name.split(':')[0])).toEqual([
        'rejected write-off',
        'agent restocks a low SKU using only the agent surface',
        'the surface defends itself',
        'confirm-guarded write-off',
      ]);
      expect(labels.some((label) => label.startsWith('approve '))).toBe(true);
      expect(labels.some((label) => label.startsWith('reject '))).toBe(true);
    },
    CLI_TIMEOUT,
  );

  it(
    '"reset": true isolates scenarios: the same mutating eval passes twice in one run',
    () => {
      const twice = ['evals/write-off.eval.json', 'evals/write-off.eval.json'];
      const run = runJanux(EXAMPLE, evalArgs(4764, twice));
      const reports = reportsFrom(run.stdout);

      // Without the reboot the second pass would find TSHIRT at 25, not 40.
      expect(run.code).toBe(0);
      expect(reports.map((report) => report.pass)).toEqual([true, true]);
    },
    CLI_TIMEOUT,
  );

  it(
    'the gate is falsifiable: the must-fail canary (write-off without approval) exits non-zero',
    () => {
      const run = runJanux(EXAMPLE, evalArgs(4762, ['broken-evals/skip-approval.eval.json']));
      const reports = reportsFrom(run.stdout);

      expect(run.code).not.toBe(0);
      expect(reports[0]?.pass).toBe(false);
      // It failed on the assertion — the confirm guard answered a proposal, not an execution.
      expect(reports[0]?.steps[0]?.detail).toContain('result mismatch');
      expect(JSON.stringify(reports[0]?.steps[0])).toContain('proposal');
    },
    CLI_TIMEOUT,
  );

  it(
    'janux verify exits 0: every agent-reachable tool documents when to use it',
    () => {
      const run = runJanux(EXAMPLE, ['verify']);

      expect(run.code).toBe(0);
      expect(run.stdout).toContain('agent surface OK');
    },
    CLI_TIMEOUT,
  );

  // examples/shop ships evals/checkout.eval.json but, until this test, nothing
  // in CI ever executed it — this is the wiring that makes the shop's own
  // agent-surface scenarios part of the gate too.
  it(
    'the shop example passes its own evals through the same gate',
    () => {
      const run = runJanux(SHOP, evalArgs(4763));
      const reports = reportsFrom(run.stdout);

      expect(run.code).toBe(0);
      expect(reports.length).toBeGreaterThan(0);
      expect(reports.every((report) => report.pass)).toBe(true);
      expect(reports.map((report) => report.name)).toContain('shop agent checkout');
    },
    CLI_TIMEOUT,
  );
});

/**
 * The human face of the same app. Restocking refreshes the inventory source,
 * and a refresh must never blank the table: `pending` means "nothing to show
 * yet", so rows already on screen stay put while the new numbers arrive.
 * Reported live as a full-page layout shift after every click.
 */
describe.skipIf(!BUILT)('examples/agent-evals in the browser', () => {
  it('restocking updates the table in place, without ever removing it', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.stockroom tbody tr');
    const before = await page.locator('.stockroom tbody tr').count();
    const stockCell = '.stockroom tbody tr:first-child td:nth-child(3)';
    // The app's stock is process state, so assert the delta, not a constant.
    const expected = Number(await page.locator(stockCell).textContent()) + 10;

    // Watch the table across the whole interaction: a single frame without
    // rows is the glitch — the click must not swap it for a placeholder.
    await page.evaluate(() => {
      (window as any).__gone = 0;
      const seen = new MutationObserver(() => {
        if (!document.querySelector('.stockroom tbody tr')) (window as any).__gone += 1;
      });

      seen.observe(document.body, { childList: true, subtree: true });
    });
    await page.click('.stockroom tbody tr:first-child button');
    // Wait for the refreshed number, not just the log line: the source
    // re-queries after the intent, and that refresh is what used to blank it.
    await page.waitForFunction(
      (total) => document.querySelector('.stockroom tbody tr:first-child td:nth-child(3)')?.textContent === String(total),
      expected,
      { timeout: 10_000 },
    );

    expect(await page.evaluate(() => (window as any).__gone)).toBe(0);
    expect(await page.locator('.stockroom tbody tr').count()).toBe(before);
    expect(await page.locator('.stockroom .log li').count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
