import { sumUsage, type TurnUsage } from './eval-usage';

export interface EvalExpect {
  ok?: boolean;
  status?: number;
  error?: string;
  result?: unknown;
}

export interface EvalStep {
  tool?: string;
  approve?: string;
  reject?: string;
  /** A whole agent turn: the message is POSTed to `/_janux/agent` and the envelope is the outcome. */
  turn?: string;
  /** Page whose manifest the agent turn should see (turn steps only). */
  path?: string;
  input?: unknown;
  expect?: EvalExpect;
}

export type { TurnUsage };

export interface EvalScenario {
  name: string;
  url?: string;
  /** Reboot the `--start` app before this scenario, so it runs from seed state. */
  reset?: boolean;
  steps: EvalStep[];
}

export interface StepOutcome {
  status: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  usage?: TurnUsage;
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
  /** Totals over the scenario's turn steps; absent when no step reported usage. */
  usage?: TurnUsage;
  /** Which run this report came from, present only under `--trials N` (N > 1). */
  trial?: number;
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

const ABSENT = '$absent';

/**
 * `{ "$some": X }` matches any array item; `{ "$not": X }` inverts a match;
 * `{ "$contains": "s" }` matches a substring — the way to assert on a tool
 * result, which travels through a turn's transcript as a JSON *string*.
 * All are single-key wrappers — mixed with literal keys they are plain keys.
 * `undefined` means "no matcher here".
 */
function matcherResult(expected: Record<string, unknown>, actual: unknown): boolean | undefined {
  const [key, ...rest] = Object.keys(expected);

  if (rest.length > 0) return undefined;
  if (key === '$not') return !deepSubset(expected['$not'], actual);
  if (key === '$some') return Array.isArray(actual) && actual.some((item) => deepSubset(expected['$some'], item));
  if (key === '$contains') return typeof actual === 'string' && actual.includes(String(expected['$contains']));

  return undefined;
}

/** Structural subset match: every expected key/index must match; extra actual data is fine. */
export function deepSubset(expected: unknown, actual: unknown): boolean {
  if (expected === ABSENT) return actual === undefined;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => deepSubset(item, actual[index]));
  }
  const matched = matcherResult(expected as Record<string, unknown>, actual);

  if (matched !== undefined) return matched;

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
  // A turn step drives the agent itself, so the model (and its prompt) is under eval.
  if (step.turn) {
    const message = { role: 'user', content: resolveRefs(step.turn, outcomes) };

    return { path: '/_janux/agent', body: { messages: [message], ...(step.path && { path: step.path }) }, headers: {} };
  }
  // Settlement steps (approve/reject) are HUMAN acts: no agent header, on purpose.
  if (step.approve) {
    return { path: '/_janux/approve', body: { id: resolveRefs(step.approve, outcomes) }, headers: {} };
  }
  if (step.reject) {
    return { path: '/_janux/reject', body: { id: resolveRefs(step.reject, outcomes) }, headers: {} };
  }
  if (!step.tool) throw new Error('step needs "tool", "turn", "approve" or "reject"');

  return {
    path: `/_janux/api/${step.tool.replace(/^api\./, '')}`,
    body: resolveRefs(step.input ?? {}, outcomes),
    headers: { 'x-janux-origin': 'agent' },
  };
}

async function performStep(step: EvalStep, outcomes: StepOutcome[], baseUrl: string, fetchImpl: typeof fetch): Promise<StepOutcome> {
  const { path, body, headers } = stepRequest(step, outcomes);
  /*
   * `Origin` because there is no browser here to send fetch metadata, and the
   * CSRF guard refuses a call to an invocation endpoint that declares no origin
   * at all (see janux-server/src/csrf.ts). Declaring the app's own base URL is the
   * truth: the runner drives that origin's agent surface on the operator's
   * behalf. It is also all the guard needs — there is no cookie jar to forge.
   */
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: new URL(baseUrl).origin, ...headers },
  });
  const envelope = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; error?: string };

  if (step.turn) return turnOutcome(res.status, envelope);

  return { status: res.status, ok: envelope.ok === true, result: envelope.result, error: envelope.error };
}

/** A turn is `ok` only when the agent actually answered — see ANSWERED. */
const ANSWERED = new Set(['text', 'ui_calls']);

/** Giving up wears `type: 'text'` too; only `stopReason` tells them apart. */
const answered = (envelope: { type?: string; stopReason?: string }) =>
  ANSWERED.has(envelope.type ?? '') && envelope.stopReason !== 'max_turns';

/**
 * The agent envelope IS the result, so evals assert on `{ type: "text" | … }`.
 * `ok` is deliberately narrow: an unconfigured model (`setup`), a refusal or a
 * provider failure all answer with a 200-ish envelope, and letting those pass
 * the default `{ ok: true }` would make a keyless CI green without ever
 * reaching a model. "Could not run" must never read as "passed" — assert those
 * outcomes explicitly (`{ ok: false, result: { type: 'refusal' } }`).
 */
function turnOutcome(
  status: number,
  envelope: { type?: string; error?: string; stopReason?: string; usage?: TurnUsage },
): StepOutcome {
  return {
    status,
    ok: status < 400 && answered(envelope),
    result: envelope,
    error: envelope.error,
    usage: envelope.usage,
  };
}

function stepLabel(step: EvalStep, index: number): string {
  if (step.turn) return `turn "${step.turn}"`;
  if (step.approve) return `approve ${step.approve}`;
  if (step.reject) return `reject ${step.reject}`;

  return step.tool ?? `step ${index}`;
}

/** Runs one scenario's steps in order against a live app's agent surface. */
export async function runScenario(scenario: EvalScenario, baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<ScenarioReport> {
  const outcomes: StepOutcome[] = [];
  const steps: StepReport[] = [];

  // Sequential by design: later steps reference earlier outcomes ($steps[i]).
  for (const [index, step] of scenario.steps.entries()) {
    const label = stepLabel(step, index);
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
  const usage = sumUsage(steps.map((step) => step.outcome.usage));

  return { name: scenario.name, pass: steps.every((step) => step.pass), steps, ...(usage && { usage }) };
}
