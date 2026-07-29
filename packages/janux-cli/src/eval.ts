import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
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

export async function evalCommand(parsed: CliCommand): Promise<void> {
  const files = scenarioFiles(parsed);

  if (files.length === 0) throw new Error('janux eval: no scenario files found (evals/**/*.eval.json)');
  const app: AppHandle = { proc: spawnApp(parsed) };

  try {
    if (app.proc) await waitFor(responds(parsed.url), `server at ${parsed.url} did not respond`);
    const results = await runFiles(files, parsed, app);

    if (parsed.json) console.log(JSON.stringify(results, null, 2));
    else reportHuman(results);
    if (results.some((result) => !result.pass)) process.exitCode = 1;
  } finally {
    if (app.proc) stopApp(app.proc);
  }
}
