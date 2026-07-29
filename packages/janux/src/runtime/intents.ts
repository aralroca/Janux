import { validate } from '../schema';
import { batch } from '../signals';
import { dryRunDiff } from './dry-run';
import { withGate, type MutationGate } from '../state/mutation-gate';
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
}

export class JanuxIntentError extends Error {
  readonly code: 'forbidden' | 'not_ready' | 'invalid_input' | 'unknown_intent';

  constructor(code: JanuxIntentError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function resolveGuard(def: IntentDef, ctx: Ctx, origin: Origin): GuardValue {
  const guard = def.guard ?? 'auto';

  if (typeof guard !== 'function') return guard;
  try {
    return guard({ ctx, origin });
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
  const result = validate(def.input, input ?? {});

  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');

    throw new JanuxIntentError('invalid_input', `Invalid input for "${tool}" — ${detail}`);
  }

  return result.value;
}

function audit(hooks: IntentHooks, entry: Omit<AuditEntry, 'at'>): void {
  hooks.onAudit?.({ ...entry, at: Date.now() });
}

async function execute(def: IntentDef, bag: RunBag, input: unknown, origin: Origin, gate: MutationGate): Promise<unknown> {
  // One flush per run: the synchronous span of the body batches its state
  // writes (async continuations flush per write, as ever). Derived reads stay
  // fresh mid-batch — `computed` recomputes on demand (see signals/index.ts).
  return withGate(gate, () => batch(() => def.run({ ...bag, input, origin })));
}

function propose(
  tool: string,
  input: unknown,
  run: () => Promise<unknown>,
  hooks: IntentHooks,
  diff?: Proposal['diff'],
) {
  const proposal: Proposal = { id: nextProposalId(tool), tool, input, diff, execute: run };

  hooks.onProposal?.(proposal);

  return { status: 'proposal' as const, id: proposal.id, tool, input, diff };
}

/** The single invocation pipeline shared by human clicks, agent calls and RPC. */
export async function invokeIntent(
  componentName: string,
  intentName: string,
  def: IntentDef,
  bag: RunBag,
  input: unknown,
  origin: Origin,
  hooks: IntentHooks,
): Promise<unknown> {
  const tool = `${componentName}.${intentName}`;
  const guard = resolveGuard(def, bag.ctx, origin);

  try {
    if (origin === 'agent' && guard === 'forbidden') {
      throw new JanuxIntentError('forbidden', `Intent "${tool}" is not available`);
    }
    checkInvocable(tool, def, bag);
    const parsed = parseInput(tool, def, input);
    const run = () => hooks.trackPending(execute(def, bag, parsed, origin, hooks.gate));

    if (origin === 'agent' && guard === 'confirm') {
      audit(hooks, { tool, origin, guard, input: parsed, ok: true, proposed: true });
      // The approved execution must reach the trail too — `proposed: true`
      // followed by silence would leave approvals unaccounted for.
      const runAudited = async () => {
        try {
          const result = await run();

          audit(hooks, { tool, origin, guard, input: parsed, ok: true });

          return result;
        } catch (error) {
          audit(hooks, { tool, origin, guard, input: parsed, ok: false, error: String(error) });
          throw error;
        }
      };

      return propose(tool, parsed, runAudited, hooks, dryRunDiff(def, bag, parsed));
    }
    const result = await run();

    audit(hooks, { tool, origin, guard, input: parsed, ok: true });

    return result;
  } catch (error) {
    audit(hooks, { tool, origin, guard, input, ok: false, error: String(error) });
    throw error;
  }
}
