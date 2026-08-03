import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { gateFailures, verdictLines, GATE_FILE } from './eval-gate';
import { appendHistory, buildRecord, comparisonLines, readBaseline, type RunMeta } from './eval-history';
import { runScenario, type EvalScenario, type ScenarioReport } from './eval-runner';
import type { CliCommand } from './args';

const START_TIMEOUT_MS = 30_000;
const POLL_MS = 500;

interface AppHandle {
  proc?: ChildProcess;
}

export function scenarioFiles({ files, root }: CliCommand): string[] {
  if (files.length > 0) return files.map((file) => resolve(root, file));

  // Sorted: the glob's disk order is not deterministic, a CI gate must be.
  return [...new Bun.Glob('evals/**/*.eval.json').scanSync(root)].sort().map((file) => resolve(root, file));
}

/** Under --json the report owns stdout, so the child app's output is silenced (stderr stays visible). */
export function childStdio({ json }: Pick<CliCommand, 'json'>): ['ignore', 'ignore', 'inherit'] | 'inherit' {
  return json ? ['ignore', 'ignore', 'inherit'] : 'inherit';
}

async function waitFor(condition: () => Promise<boolean>, failure: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_MS));
  }
  throw new Error(`janux eval: ${failure} within ${START_TIMEOUT_MS / 1000}s`);
}

const responds = (url: string) => () => fetch(url).then(() => true, () => false);
const gone = (url: string) => () => fetch(url).then(() => false, () => true);

function spawnApp(parsed: CliCommand): ChildProcess | undefined {
  if (!parsed.startCommand) return undefined;

  return spawn(parsed.startCommand, { shell: true, detached: true, stdio: childStdio(parsed), cwd: parsed.root });
}

function stopApp(proc: ChildProcess): void {
  if (proc.pid) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }
}

/** `"reset": true` isolation: reboot the --start app so the scenario runs from seed state. */
async function resetApp(parsed: CliCommand, app: AppHandle): Promise<void> {
  stopApp(app.proc!);
  await waitFor(gone(parsed.url), `server at ${parsed.url} did not stop`);
  app.proc = spawnApp(parsed);
  await waitFor(responds(parsed.url), `server at ${parsed.url} did not respond`);
}

function reportHuman(results: ScenarioReport[]): void {
  results.forEach((result) => {
    console.log(`\n${result.pass ? '✓' : '✗'} ${result.name}`);
    result.steps.forEach((step) =>
      console.log(`  ${step.pass ? '✓' : '✗'} ${step.label}${step.detail ? ` — ${step.detail}` : ''}`),
    );
  });
}

async function runFiles(files: string[], parsed: CliCommand, app: AppHandle): Promise<ScenarioReport[]> {
  const results: ScenarioReport[] = [];

  // Sequential: scenarios share one live app and may mutate its state.
  for (const file of files) {
    const scenario = JSON.parse(readFileSync(file, 'utf8')) as EvalScenario;

    if (scenario.reset && app.proc) await resetApp(parsed, app);
    results.push(await runScenario(scenario, scenario.url ?? parsed.url));
  }

  return results;
}

/** Best-effort: outside a git checkout the record simply carries no commit. */
function gitCommit(root: string): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
}

function runMeta(root: string, started: number): RunMeta {
  return {
    runId: randomUUID().slice(0, 8),
    date: new Date().toISOString(),
    commit: gitCommit(root),
    model: process.env.JANUX_MODEL,
    durationMs: Date.now() - started,
  };
}

async function runTrials(files: string[], parsed: CliCommand, app: AppHandle): Promise<ScenarioReport[][]> {
  const trials: ScenarioReport[][] = [];

  // Mutating scenarios should declare `"reset": true` so every trial replays from seed state.
  for (let trial = 0; trial < parsed.trials; trial += 1) trials.push(await runFiles(files, parsed, app));

  return trials;
}

/**
 * The gate + the story, all on stderr and local files: stdout stays the pure
 * JSON array CI parsers already consume (didit-gate's stdout compatibility
 * rule). The verdict, the baseline comparison and the bill are for humans and
 * the CI log; `eval-gate.json` is for the workflow step that needs structure.
 */
function settleRun(trials: ScenarioReport[][], parsed: CliCommand, started: number): boolean {
  const failures = gateFailures(trials);
  const record = buildRecord(trials, runMeta(parsed.root, started));
  const baseline = readBaseline(parsed.root, parsed.baseline);

  writeFileSync(resolve(parsed.root, GATE_FILE), `${JSON.stringify({ failures }, null, 2)}\n`);
  appendHistory(parsed.root, record);
  [...verdictLines(failures), ...comparisonLines(record, baseline)].forEach((line) => console.error(line));

  return failures.length === 0;
}

export async function evalCommand(parsed: CliCommand): Promise<void> {
  const files = scenarioFiles(parsed);
  const started = Date.now();

  if (files.length === 0) throw new Error('janux eval: no scenario files found (evals/**/*.eval.json)');
  const app: AppHandle = { proc: spawnApp(parsed) };

  try {
    if (app.proc) await waitFor(responds(parsed.url), `server at ${parsed.url} did not respond`);
    const trials = await runTrials(files, parsed, app);
    const results = trials.flat();

    if (parsed.json) console.log(JSON.stringify(results, null, 2));
    else reportHuman(results);
    // With one trial this is exactly the old exit rule: any failing scenario is
    // a 1/1-trials failure. More trials make the gate reproducible-only.
    if (!settleRun(trials, parsed, started)) process.exitCode = 1;
  } finally {
    if (app.proc) stopApp(app.proc);
  }
}
