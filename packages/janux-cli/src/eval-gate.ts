import type { ScenarioReport, StepReport } from './eval-runner';

/**
 * The regression gate over trial runs, adapted from Didit's `didit-gate`
 * reporter. The rule: a scenario fails the gate only when it fails in EVERY
 * trial. Reproducibility is the discriminator — a real regression fails all
 * trials, a model wobble or a transient hiccup does not — so CI runs
 * `--trials 2` and a single red trial stays informative instead of blocking.
 * A gate that turns red on its own is a gate people learn to ignore.
 */

export const GATE_FILE = 'eval-gate.json';

export interface GateFailure {
  name: string;
  reason: string;
}

function failingStep(report: ScenarioReport): StepReport | undefined {
  return report.steps.find((step) => !step.pass);
}

/** "What regressed", for the CI log: the trial count plus the first failing step. */
function failureReason(reports: ScenarioReport[]): string {
  const failed = `failed in ${reports.length}/${reports.length} trials`;
  const step = reports.map(failingStep).find(Boolean);

  if (!step) return failed;

  return `${failed} — ${step.label}: ${step.detail ?? 'failed'}`;
}

/** Scenarios are position-aligned across trials: every trial runs the same sorted file list. */
export function gateFailures(trials: ScenarioReport[][]): GateFailure[] {
  const scenarios = trials[0] ?? [];

  return scenarios
    .map((report, index) => ({ name: report.name, reports: trials.map((trial) => trial[index]!) }))
    .filter(({ reports }) => reports.every((trialReport) => !trialReport.pass))
    .map(({ name, reports }) => ({ name, reason: failureReason(reports) }));
}

/** The verdict block: what `janux eval` prints to stderr and CI logs show. */
export function verdictLines(failures: GateFailure[]): string[] {
  if (failures.length === 0) return ['eval gate: clean'];

  return [`eval gate: ${failures.length} failure(s)`, ...failures.map(({ name, reason }) => `  x ${name}: ${reason}`)];
}
