import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ScenarioReport } from './eval-runner';
import { sumUsage, type TurnUsage } from './eval-usage';

/**
 * Run history as a local JSONL file — one line per `janux eval` run, with the
 * metadata that makes runs comparable (commit, model, date) and the bill.
 * `.janux/` is already gitignored, so the history stays on the machine that
 * produced it; teams that want a shared baseline commit one record via
 * `--baseline`. No external service anywhere, on purpose.
 */

export const HISTORY_FILE = '.janux/evals/history.jsonl';

export interface RunScenario {
  name: string;
  passes: boolean[];
}

export interface RunMeta {
  runId: string;
  date: string;
  commit?: string;
  model?: string;
  durationMs: number;
}

export interface RunRecord extends RunMeta {
  trials: number;
  scenarios: RunScenario[];
  usage?: TurnUsage;
}

export interface RunComparison {
  improved: string[];
  regressed: string[];
}

export function buildRecord(trials: ScenarioReport[][], meta: RunMeta): RunRecord {
  const scenarios = (trials[0] ?? []).map((report, index) => ({
    name: report.name,
    passes: trials.map((trial) => trial[index]!.pass),
  }));
  const usage = sumUsage(trials.flat().map((report) => report.usage));

  return { ...meta, trials: trials.length, scenarios, ...(usage && { usage }) };
}

/** Fail-open: losing a history line must never fail the eval run that produced it. */
export function appendHistory(root: string, record: RunRecord): void {
  try {
    const file = join(root, HISTORY_FILE);

    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch {
    // The run report already went to stdout; history is best-effort.
  }
}

/** An explicit `--baseline` file wins; otherwise the last locally recorded run. */
export function readBaseline(root: string, baselineFile?: string): RunRecord | undefined {
  try {
    if (baselineFile) return JSON.parse(readFileSync(baselineFile, 'utf8'));
    const line = readFileSync(join(root, HISTORY_FILE), 'utf8').split('\n').filter(Boolean).at(-1);

    return line ? JSON.parse(line) : undefined;
  } catch {
    return undefined;
  }
}

/** Same rule as the gate: passing any trial is passing the run. */
const runPass = (scenario: RunScenario) => scenario.passes.some(Boolean);

export function compareRuns(baseline: RunRecord, current: RunRecord): RunComparison {
  const before = new Map(baseline.scenarios.map((scenario) => [scenario.name, runPass(scenario)]));
  const known = current.scenarios.filter((scenario) => before.has(scenario.name));

  return {
    improved: known.filter((scenario) => runPass(scenario) && !before.get(scenario.name)).map(({ name }) => name),
    regressed: known.filter((scenario) => !runPass(scenario) && before.get(scenario.name)).map(({ name }) => name),
  };
}

const formatCost = (cost: number) => `$${Number(cost.toFixed(6))}`;

function costLine(current: RunRecord, baseline?: RunRecord): string[] {
  const usage = current.usage;

  if (!usage) return [];
  const tokens = `cost: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out tokens`;

  if (usage.costUsd === undefined) return [tokens];
  const base = baseline?.usage?.costUsd;
  const priced = base === undefined ? formatCost(usage.costUsd) : `${formatCost(usage.costUsd)}, baseline ${formatCost(base)}`;

  return [`${tokens} (${priced})`];
}

function diffLines(current: RunRecord, baseline: RunRecord): string[] {
  const { improved, regressed } = compareRuns(baseline, current);
  const commit = baseline.commit ? `, commit ${baseline.commit}` : '';
  const header = `vs baseline ${baseline.runId} (${baseline.date}${commit}):`;

  if (improved.length === 0 && regressed.length === 0) return [`${header} no changes`];

  return [header, ...regressed.map((name) => `  regressed: ${name}`), ...improved.map((name) => `  improved: ${name}`)];
}

/** The end-of-run story: what improved, what regressed, and what it cost. */
export function comparisonLines(current: RunRecord, baseline: RunRecord | undefined): string[] {
  if (!baseline) return ['no baseline to compare — this run is the first recorded', ...costLine(current)];

  return [...diffLines(current, baseline), ...costLine(current, baseline)];
}
