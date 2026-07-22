export interface EvalExpect {
  ok?: boolean;
  status?: number;
  error?: string;
  result?: unknown;
}

export interface EvalStep {
  tool?: string;
  approve?: string;
  input?: unknown;
  expect?: EvalExpect;
}

export interface EvalScenario {
  name: string;
  url?: string;
  steps: EvalStep[];
}

export interface StepOutcome {
  status: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface StepReport {
  label: string;
  pass: boolean;
  detail?: string;
  outcome: StepOutcome;
}

export interface ScenarioReport {
  name: string;
  pass: boolean;
  steps: StepReport[];
}

const REF_PATTERN = /^\$steps\[(\d+)\]\.(.+)$/;

function resolveRef(value: string, outcomes: StepOutcome[]): unknown {
  const match = REF_PATTERN.exec(value);

  if (!match) return value;
  const outcome = outcomes[Number(match[1])];
  const resolved = match[2]!.split('.').reduce<unknown>((acc, key) => (acc as any)?.[key], outcome);

  if (resolved === undefined) throw new Error(`unresolvable reference "${value}"`);

  return resolved;
}

/** Replaces `$steps[i].<dot.path>` strings anywhere in a value with earlier step outcomes. */
export function resolveRefs(value: unknown, outcomes: StepOutcome[]): unknown {
  if (typeof value === 'string') return resolveRef(value, outcomes);
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, outcomes));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(item, outcomes)]));
  }

  return value;
}

/** Structural subset match: every expected key/index must match; extra actual data is fine. */
export function deepSubset(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => deepSubset(item, actual[index]));
  }

  return (
    actual !== null &&
    typeof actual === 'object' &&
    Object.entries(expected).every(([key, item]) => deepSubset(item, (actual as any)[key]))
  );
}

function checkExpect(expect: EvalExpect | undefined, outcome: StepOutcome): string | undefined {
  const rules = expect ?? { ok: true };

  if (rules.ok !== undefined && outcome.ok !== rules.ok) return `expected ok ${rules.ok}, got ${outcome.ok} (${outcome.error ?? ''})`;
  if (rules.status !== undefined && outcome.status !== rules.status) return `expected status ${rules.status}, got ${outcome.status}`;
  if (rules.error !== undefined && !String(outcome.error ?? '').includes(rules.error)) return `expected error containing "${rules.error}", got "${outcome.error}"`;
  if (rules.result !== undefined && !deepSubset(rules.result, outcome.result)) return `result mismatch, got ${JSON.stringify(outcome.result)}`;

  return undefined;
}

function stepRequest(step: EvalStep, outcomes: StepOutcome[]): { path: string; body: unknown; headers: Record<string, string> } {
  if (step.approve) {
    return { path: '/_janux/approve', body: { id: resolveRefs(step.approve, outcomes) }, headers: {} };
  }
  if (!step.tool) throw new Error('step needs "tool" or "approve"');

  return {
    path: `/_janux/api/${step.tool.replace(/^api\./, '')}`,
    body: resolveRefs(step.input ?? {}, outcomes),
    headers: { 'x-janux-origin': 'agent' },
  };
}

async function performStep(step: EvalStep, outcomes: StepOutcome[], baseUrl: string, fetchImpl: typeof fetch): Promise<StepOutcome> {
  const { path, body, headers } = stepRequest(step, outcomes);
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
  const envelope = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; error?: string };

  return { status: res.status, ok: envelope.ok === true, result: envelope.result, error: envelope.error };
}

/** Runs one scenario's steps in order against a live app's agent surface. */
export async function runScenario(scenario: EvalScenario, baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<ScenarioReport> {
  const outcomes: StepOutcome[] = [];
  const steps: StepReport[] = [];

  // Sequential by design: later steps reference earlier outcomes ($steps[i]).
  for (const [index, step] of scenario.steps.entries()) {
    const label = step.approve ? `approve ${step.approve}` : (step.tool ?? `step ${index}`);
    let report: StepReport;

    try {
      const outcome = await performStep(step, outcomes, baseUrl, fetchImpl);
      const detail = checkExpect(step.expect, outcome);

      report = { label, pass: !detail, detail, outcome };
    } catch (error) {
      report = { label, pass: false, detail: String(error), outcome: { status: 0, ok: false, error: String(error) } };
    }
    outcomes.push(report.outcome);
    steps.push(report);
  }

  return { name: scenario.name, pass: steps.every((step) => step.pass), steps };
}
