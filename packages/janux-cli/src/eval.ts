import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { runScenario, type EvalScenario, type ScenarioReport } from './eval-runner';
import type { CliCommand } from './args';

const START_TIMEOUT_MS = 30_000;

function scenarioFiles({ files, root }: CliCommand): string[] {
  if (files.length > 0) return files.map((file) => resolve(root, file));

  return [...new Bun.Glob('evals/**/*.eval.json').scanSync(root)].map((file) => resolve(root, file));
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const responded = await fetch(url).then(() => true, () => false);

    if (responded) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`janux eval: server at ${url} did not respond within ${START_TIMEOUT_MS / 1000}s`);
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

function reportHuman(results: ScenarioReport[]): void {
  results.forEach((result) => {
    console.log(`\n${result.pass ? '✓' : '✗'} ${result.name}`);
    result.steps.forEach((step) =>
      console.log(`  ${step.pass ? '✓' : '✗'} ${step.label}${step.detail ? ` — ${step.detail}` : ''}`),
    );
  });
}

async function runFiles(files: string[], baseUrl: string): Promise<ScenarioReport[]> {
  const results: ScenarioReport[] = [];

  // Sequential: scenarios share one live app and may mutate its state.
  for (const file of files) {
    const scenario = JSON.parse(readFileSync(file, 'utf8')) as EvalScenario;

    results.push(await runScenario(scenario, scenario.url ?? baseUrl));
  }

  return results;
}

export async function evalCommand(parsed: CliCommand): Promise<void> {
  const files = scenarioFiles(parsed);

  if (files.length === 0) throw new Error('janux eval: no scenario files found (evals/**/*.eval.json)');
  const proc = parsed.startCommand
    ? spawn(parsed.startCommand, { shell: true, detached: true, stdio: 'inherit', cwd: parsed.root })
    : undefined;

  try {
    if (proc) await waitForServer(parsed.url);
    const results = await runFiles(files, parsed.url);

    if (parsed.json) console.log(JSON.stringify(results, null, 2));
    else reportHuman(results);
    if (results.some((result) => !result.pass)) process.exitCode = 1;
  } finally {
    if (proc) stopApp(proc);
  }
}
