import { coerceForm, validate } from '../schema';
import { batch } from '../signals';
import { dryRunDiff } from './dry-run';
import { flushRenders } from './render-queue';
import { isTracing, withSpan, type JanuxSpan, type SpanAttributes } from '../observability/tracing';
import { withGate, type MutationGate } from '../state/mutation-gate';
import { publishJanuxError } from '../dev/error-channel';
import type { ComponentDef, Ctx, GuardValue, IntentDef, Origin, RunBag } from '../define/types';

export interface AuditEntry {
  tool: string;
  origin: Origin;
  guard: GuardValue;
  input: unknown;
  ok: boolean;
  error?: string;
  at: number;
  /** Verified Web Bot Auth key id, when the caller is an authenticated agent. */
  agent?: string;
  /**
   * The call was recorded as a pending proposal, not run. Without it a `confirm`
   * guard logged `ok: true` the moment an agent asked, so the trail claimed a
   * success for something a human may never approve.
   */
  proposed?: boolean;
}

export interface Proposal {
  id: string;
  tool: string;
  input: unknown;
  /** Shadow-run before/after of the component state (pure intents only). */
  diff?: import('./dry-run').StateDiff;
  execute: () => Promise<unknown>;
}

export interface IntentHooks {
  gate: MutationGate;
  onAudit?: (entry: AuditEntry) => void;
  onProposal?: (proposal: Proposal) => void;
  trackPending: <T>(work: Promise<T>) => Promise<T>;
  /** Dev only: the island this pipeline belongs to, for the error overlay's chain. */
  devUri?: string;
}

export class JanuxIntentError extends Error {
  readonly code: 'forbidden' | 'not_ready' | 'invalid_input' | 'unknown_intent';

  constructor(code: JanuxIntentError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const GUARD_VALUES = new Set<GuardValue>(['auto', 'confirm', 'forbidden']);

/**
 * Anything that is not one of the three answers is not an answer.
 *
 * `guard === 'forbidden'` is false for a `Promise`, so an `async` guard — which
 * the types forbid and JavaScript happily allows — used to resolve to a *pass*:
 * the gate that exists to fail closed failed open, silently, for every agent
 * call, and the intent was advertised in the manifest besides. Same for a
 * typo'd value. Both deny here, and say so once so the author finds out from a
 * log rather than from an incident. Mirrors `resolveApiGuard` in @janux/server.
 */
function normalizeGuard(tool: string, value: unknown): GuardValue {
  if (GUARD_VALUES.has(value as GuardValue)) return value as GuardValue;
  console.warn(
    `Janux: the guard on "${tool}" answered ${JSON.stringify(String(value))} — expected "auto", "confirm" or "forbidden", so the intent is treated as forbidden`,
  );

  return 'forbidden';
}

export function resolveGuard(def: IntentDef, ctx: Ctx, origin: Origin, tool = 'intent'): GuardValue {
  const guard = def.guard ?? 'auto';

  if (typeof guard !== 'function') return normalizeGuard(tool, guard);
  try {
    return normalizeGuard(tool, guard({ ctx, origin }));
  } catch {
    // A guard that cannot decide denies. Letting the throw escape took the whole
    // manifest down with it, so one bad guard blanked the entire agent surface —
    // and any other recovery would have to fail open.
    return 'forbidden';
  }
}

/**
 * Unguessable, like the server's. A proposal id is the only thing standing between
 * a pending `confirm` call and its execution, so a shared counter made one
 * approvable by anyone who could count.
 */
function nextProposalId(tool: string): string {
  return `prop_${tool.replace(/\W/g, '_')}_${crypto.randomUUID()}`;
}

function checkInvocable(tool: string, def: IntentDef, bag: RunBag): void {
  if (def.ready && !def.ready(bag)) {
    throw new JanuxIntentError('not_ready', `Intent "${tool}" is not ready`);
  }
}

function parseInput(tool: string, def: IntentDef, input: unknown): unknown {
  if (!def.input) return undefined;
  const candidate = def.coerce === 'form' ? coerceForm(input ?? {}, def.input) : input ?? {};
  const result = validate(def.input, candidate);

  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');

    throw new JanuxIntentError('invalid_input', `Invalid input for "${tool}" — ${detail}`);
  }

  return result.value;
}

function audit(hooks: IntentHooks, entry: Omit<AuditEntry, 'at'>): void {
  hooks.onAudit?.({ ...entry, at: Date.now() });
}

/** Who is invoking what, under which guard — the three facts every span and every audit entry repeats. */
interface Invoked {
  tool: string;
  guard: GuardValue;
  origin: Origin;
}

/** The two halves of `tool`, kept apart for the dev overlay's error chain. */
interface IntentId {
  component: string;
  name: string;
}

/**
 * The attribute set no other framework can emit, because no other framework
 * knows the answers: which named intent, which guard decided, and whether a
 * human or an agent asked.
 */
function attributesOf({ tool, guard, origin }: Invoked, proposal?: string): SpanAttributes {
  return { 'janux.intent': tool, 'janux.guard': guard, 'janux.origin': origin, 'janux.proposal.id': proposal };
}

async function execute(def: IntentDef, bag: RunBag, input: unknown, origin: Origin, gate: MutationGate): Promise<unknown> {
  // One flush per run: the synchronous span of the body batches its state
  // writes (async continuations flush per write, as ever). Derived reads stay
  // fresh mid-batch — `computed` recomputes on demand (see signals/index.ts).
  return withGate(gate, () => batch(() => def.run({ ...bag, input, origin })));
}

function propose(id: string, invoked: Invoked, input: unknown, run: () => Promise<unknown>, hooks: IntentHooks, diff?: Proposal['diff']) {
  const proposal: Proposal = { id, tool: invoked.tool, input, diff, execute: run };

  hooks.onProposal?.(proposal);

  return { status: 'proposal' as const, id, tool: invoked.tool, input, diff };
}

/** The approved execution must reach the trail too — `proposed: true` followed by silence would leave approvals unaccounted for. */
async function runAudited(invoked: Invoked, id: IntentId, input: unknown, run: () => Promise<unknown>, hooks: IntentHooks): Promise<unknown> {
  try {
    const result = await run();

    audit(hooks, { ...invoked, input, ok: true });

    return result;
  } catch (error) {
    audit(hooks, { ...invoked, input, ok: false, error: String(error) });
    if (import.meta.env?.DEV) {
      publishJanuxError(error, {
        kind: 'intent',
        component: id.component,
        name: id.name,
        island: hooks.devUri,
        origin: invoked.origin,
        guard: invoked.guard,
        input,
      });
    }
    throw error;
  }
}

/**
 * A proposal's execution gets a span of its own: the human approval that
 * triggers it happens later, and often never. Folded into the proposing span,
 * a trace could not tell "an agent asked" apart from "a human said yes".
 */
function approvedRun(proposalId: string, invoked: Invoked, id: IntentId, input: unknown, run: () => Promise<unknown>, hooks: IntentHooks) {
  return () =>
    withSpan('janux.intent.execute', () => attributesOf(invoked, proposalId), () => runAudited(invoked, id, input, run, hooks));
}

async function runInvocation(
  invoked: Invoked,
  id: IntentId,
  def: IntentDef,
  bag: RunBag,
  input: unknown,
  hooks: IntentHooks,
  span?: JanuxSpan,
): Promise<unknown> {
  const { tool, guard, origin } = invoked;

  /*
   * The `import.meta.env?.DEV` publishes (here and in runAudited) hand the dev
   * overlay the whole sentence, not just the stack: this pipeline is the one
   * place that knows who asked and what the guard decided for them (design
   * invariant 4). They are written out twice rather than hoisted into a shared
   * `chain` const because a const the branches share survives constant-folding
   * as 9 bytes of residue, and this must cost the production bundle exactly
   * nothing — see `bundle-size.test.ts`, which measures it.
   */
  try {
    if (origin === 'agent' && guard === 'forbidden') {
      throw new JanuxIntentError('forbidden', `Intent "${tool}" is not available`);
    }
    checkInvocable(tool, def, bag);
    const parsed = parseInput(tool, def, input);
    const run = () => hooks.trackPending(execute(def, bag, parsed, origin, hooks.gate));

    if (origin === 'agent' && guard === 'confirm') {
      const proposalId = nextProposalId(tool);

      span?.setAttributes({ 'janux.proposal.id': proposalId });
      audit(hooks, { ...invoked, input: parsed, ok: true, proposed: true });

      return propose(proposalId, invoked, parsed, approvedRun(proposalId, invoked, id, parsed, run, hooks), hooks, dryRunDiff(def, bag, parsed));
    }
    const result = await run();

    // The render this intent caused is queued, so resolve only once it has
    // run: `await intent()` promising a DOM that has not caught up yet is a
    // trap every caller would have to work around.
    flushRenders();
    audit(hooks, { ...invoked, input: parsed, ok: true });

    return result;
  } catch (error) {
    audit(hooks, { ...invoked, input, ok: false, error: String(error) });
    if (import.meta.env?.DEV) {
      publishJanuxError(error, {
        kind: 'intent',
        component: id.component,
        name: id.name,
        island: hooks.devUri,
        origin,
        guard,
        input,
      });
    }
    throw error;
  }
}

/** The single invocation pipeline shared by human clicks, agent calls and RPC. */
export function invokeIntent(
  componentName: string,
  intentName: string,
  def: IntentDef,
  bag: RunBag,
  input: unknown,
  origin: Origin,
  hooks: IntentHooks,
): Promise<unknown> {
  const tool = `${componentName}.${intentName}`;
  const invoked: Invoked = { tool, guard: resolveGuard(def, bag.ctx, origin, tool), origin };
  const id: IntentId = { component: componentName, name: intentName };

  // Guarded rather than left to `withSpan`: an uninstrumented click must not
  // allocate the two closures a traced one needs. Same reasoning as renderIsland.
  if (!isTracing()) return runInvocation(invoked, id, def, bag, input, hooks);

  return withSpan('janux.intent', () => attributesOf(invoked), (span) => runInvocation(invoked, id, def, bag, input, hooks, span));
}
