import { describe, expect, it } from 'bun:test';
import { appRoot, ssrApp } from './support/app';

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

/** `--start` inherits the server's stdio, so boot logs share stdout with the JSON report. */
function reportsFrom(stdout: string): ScenarioReport[] {
  return JSON.parse(stdout.slice(stdout.indexOf('[')));
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
    'janux eval --json exits 0 and every scripted agent task passes, approval step included',
    () => {
      const run = runJanux(EXAMPLE, evalArgs(4761));
      const reports = reportsFrom(run.stdout);
      const labels = reports.flatMap((report) => report.steps.map((step) => step.label));

      expect(run.code).toBe(0);
      expect(reports.map((report) => report.pass)).toEqual([true, true, true]);
      expect(labels.some((label) => label.startsWith('approve '))).toBe(true);
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
