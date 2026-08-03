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

/**
 * What actually answered, not what the environment suggested: inside the app
 * `defineAgent({ model })` outranks `JANUX_MODEL`, so the env var the runner
 * can read is a guess — and a baseline labelled with the wrong model cannot be
 * compared against anything. The turn envelope reports the resolved one.
 */
function answeringModel(trials: ScenarioReport[][]): string | undefined {
  const results = trials.flat().flatMap((report) => report.steps.map((step) => step.outcome.result));
  const reported = results.find((result) => typeof (result as { model?: unknown })?.model === 'string');

  return (reported as { model?: string } | undefined)?.model;
}

export function buildRecord(trials: ScenarioReport[][], meta: RunMeta): RunRecord {
  const scenarios = (trials[0] ?? []).map((report, index) => ({
    name: report.name,
    passes: trials.map((trial) => trial[index]!.pass),
  }));
  const usage = sumUsage(trials.flat().map((report) => report.usage));
  const model = answeringModel(trials) ?? meta.model;

  return { ...meta, model, trials: trials.length, scenarios, ...(usage && { usage }) };
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

const isRunRecord = (value: unknown): value is RunRecord =>
  typeof value === 'object' && value !== null && Array.isArray((value as RunRecord).scenarios);

/** The local history is a cache: a truncated last line loses a comparison, never a run. */
function lastRecorded(root: string): RunRecord | undefined {
  try {
    const line = readFileSync(join(root, HISTORY_FILE), 'utf8').split('\n').filter(Boolean).at(-1);
    const parsed = line ? JSON.parse(line) : undefined;

    return isRunRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An explicit `--baseline` file wins; otherwise the last locally recorded run.
 * A named baseline that cannot be used is an error and not silence: a renamed
 * file would otherwise stop the comparison while CI stayed reassuringly green.
 */
export function readBaseline(root: string, baselineFile?: string): RunRecord | undefined {
  if (!baselineFile) return lastRecorded(root);
  const raw = ((): unknown => {
    try {
      return JSON.parse(readFileSync(baselineFile, 'utf8'));
    } catch {
      throw new Error(`janux eval: --baseline ${baselineFile} could not be read as JSON`);
    }
  })();

  if (!isRunRecord(raw)) throw new Error(`janux eval: --baseline ${baselineFile} is not a run record`);

  return raw;
}

/** Same rule as the gate: passing any trial is passing the run. */
const runPass = (scenario: RunScenario) => scenario.passes.some(Boolean);

/*
 * Compared by name, not by position: a baseline is worth having precisely when
 * the scenario set has drifted, and a file added at the top must not report
 * every scenario after it as changed. Scenarios new on either side are simply
 * absent from the story — there is nothing to compare them against.
 */

export function compareRuns(baseline: RunRecord, current: RunRecord): RunComparison {
  const before = new Map(baseline.scenarios.map((scenario) => [scenario.name, runPass(scenario)]));
  const known = current.scenarios.filter((scenario) => before.has(scenario.name));

  return {
    improved: known.filter((scenario) => runPass(scenario) && !before.get(scenario.name)).map(({ name }) => name),
    regressed: known.filter((scenario) => !runPass(scenario) && before.get(scenario.name)).map(({ name }) => name),
  };
}

const formatCost = (cost: number) => `$${Number(cost.toFixed(6))}`;

/**
 * Runs are compared per trial, never by raw total: the recipe puts a nightly on
 * `--trials 3` against a baseline committed from a 1-trial run, and comparing
 * the totals would print a permanent 3x "cost regression" nothing could clear.
 */
const perTrial = (record: RunRecord) => (record.usage?.costUsd ?? 0) / (record.trials || 1);

function priceParts(current: RunRecord, baseline?: RunRecord): string[] {
  const rate = current.trials > 1 ? [`${formatCost(perTrial(current))} per trial`] : [];
  const base = baseline?.usage?.costUsd === undefined ? [] : [`baseline ${formatCost(perTrial(baseline))} per trial`];

  return [formatCost(current.usage!.costUsd!), ...rate, ...base];
}

function costLine(current: RunRecord, baseline?: RunRecord): string[] {
  const usage = current.usage;

  if (!usage) return [];
  const tokens = `cost: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out tokens`;

  if (usage.costUsd === undefined) return [tokens];

  return [`${tokens} (${priceParts(current, baseline).join(', ')})`];
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
