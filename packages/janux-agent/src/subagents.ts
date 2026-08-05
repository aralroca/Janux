import type { AgentDeps } from '@janux/server';
import type { InputProcessor } from './harness/processors';
import type { RateLimiter } from './harness/rate-limit';
import type { ModelEnv, ResolvedModel } from './model';
import type { ModelCost } from './tracing';
import type { TurnBill } from './usage';
import { runProcessors } from './harness/processors';
import { resolveModel } from './model';
import { tracedRound, tracedSubagentTurn, turnUsageAttributes } from './tracing';
import { allowsTool, type ToolFilter } from './tool-filter';
import { turnBill } from './usage';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type TokenUsage, type ToolCall } from './providers';

/**
 * Subagents (eve parity): a named delegate with its own system prompt, its own
 * server-side tool surface and a MANDATORY budget. The parent's model reaches
 * it as one `delegate.<name>` tool; the subagent starts with fresh history —
 * the task message is all the context it gets — and hands back a single
 * report. Everything runs inside the parent's HTTP turn, so the caller's
 * identity, guardrails and rate limit keep applying; a subagent is a way to
 * focus a task, never a way to widen what the caller could do alone.
 */

export interface SubagentBudget {
  /** Provider rounds the delegation may spend. Mandatory: an unbounded delegation loop is an open tab on someone's bill. */
  maxTurns: number;
  /** Total tokens (input + output) across the delegation's rounds. */
  maxTokens?: number;
  /** Wall-clock milliseconds for the whole delegation. */
  maxMs?: number;
}

export interface SubagentConfig {
  /** What the parent's model reads to decide when to delegate. */
  description: string;
  /** The subagent's own system prompt — it never inherits the parent's. */
  instructions: string;
  /** Defaults to the parent's resolved model. */
  model?: string;
  modelOptions?: Record<string, unknown>;
  /** Prices the subagent's rounds; falls back to unpriced tokens, never to the parent's cost. */
  cost?: ModelCost;
  /** Narrows the PARENT's tool surface — the effective surface is the intersection, never wider. */
  tools?: ToolFilter;
  budget: SubagentBudget;
}

export const DELEGATE_PREFIX = 'delegate.';

const TASK_INPUT = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      description: 'Everything the subagent needs. It starts with fresh history and cannot see this conversation.',
    },
  },
  required: ['task'],
};

/**
 * Definition-time check, so a missing budget fails the deploy instead of the
 * first delegation storm. The type already requires it; this backs plain JS.
 */
export function validateSubagents(subagents: Record<string, SubagentConfig> | undefined): void {
  const unbudgeted = Object.entries(subagents ?? {}).filter(([, sub]) => !sub.budget || !(sub.budget.maxTurns >= 1));

  if (unbudgeted.length > 0) {
    const names = unbudgeted.map(([name]) => name).join(', ');

    throw new Error(`Every subagent needs a budget with maxTurns >= 1. Missing on: ${names}`);
  }
}

/** One model-visible tool per subagent, on the parent's tool list. */
export function delegationTools(subagents: Record<string, SubagentConfig> | undefined): AgentTool[] {
  return Object.entries(subagents ?? {}).map(([name, sub]) => ({
    name: `${DELEGATE_PREFIX}${name}`,
    description: `Delegate a focused subtask to the "${name}" subagent. ${sub.description}`,
    input: TASK_INPUT,
  }));
}

/** Everything a delegation borrows from the parent turn it runs inside. */
export interface DelegationContext {
  deps: AgentDeps;
  manifest: any;
  env: ModelEnv;
  fetchImpl: FetchLike;
  parentModel: ResolvedModel;
  parentTools: ToolFilter | undefined;
  /** Remote MCP tools the parent discovered, with the connection to call them. */
  remoteTools: AgentTool[];
  callRemote: ((name: string, input: unknown) => Promise<unknown>) | undefined;
  ownsRemote: (name: string) => boolean;
  processors: InputProcessor[];
  limiter: RateLimiter | undefined;
  identity: string;
}

export interface DelegationOutcome {
  /** What the parent's model reads as the tool result. */
  report: Record<string, unknown>;
  /** The delegation's own bill, for the turn's envelope total. */
  bill?: TurnBill;
}

/**
 * The intersection rule that makes a subagent escalation-proof: a tool must
 * pass the PARENT's filter and the subagent's own — declaring a wider filter
 * on the child cannot reach anything the parent was denied.
 */
function allowedFor(sub: SubagentConfig, parentTools: ToolFilter | undefined): (name: string) => boolean {
  return (name) => allowsTool(name, parentTools) && allowsTool(name, sub.tools);
}

/**
 * A subagent's surface is server-executable only: `api.*` intents and remote
 * MCP tools. UI tools need the browser round-trip the parent loop owns, and
 * delegation itself stays off the list — depth one, so a delegation chain
 * cannot outrun its own budget.
 */
function subagentSurface(sub: SubagentConfig, ctx: DelegationContext): AgentTool[] {
  const allowed = allowedFor(sub, ctx.parentTools);
  const apiTools = ((ctx.manifest.tools ?? []) as { name: string; description?: string; guard?: string; input?: Record<string, unknown> }[])
    .filter((tool) => tool.name.startsWith('api.') && allowed(tool.name))
    .map((tool) => ({ name: tool.name, description: `${tool.description ?? ''} [guard:${tool.guard}]`.trim(), input: tool.input }));

  return [...apiTools, ...ctx.remoteTools.filter((tool) => allowed(tool.name))];
}

/** Executes one subagent tool call — or refuses it, if it falls outside the intersection. */
async function dispatchCall(call: ToolCall, sub: SubagentConfig, ctx: DelegationContext): Promise<string> {
  const forbidden = JSON.stringify({ error: `tool_forbidden: ${call.name} is not on this subagent's tool surface` });
  const run = () => {
    if (call.name.startsWith('api.')) return ctx.deps.invoke(call.name, call.input);
    if (ctx.ownsRemote(call.name) && ctx.callRemote) return ctx.callRemote(call.name, call.input);

    return undefined;
  };

  if (!allowedFor(sub, ctx.parentTools)(call.name)) return forbidden;
  const running = run();

  if (!running) return forbidden;

  return running.then((result) => JSON.stringify(result ?? null)).catch((error) => JSON.stringify({ error: String(error) }));
}

type SubagentRound = Awaited<ReturnType<typeof callProvider>> | { providerError: string };

/** Which budget line is spent, if any — checked before every round. */
function budgetCut(budget: SubagentBudget, startedAt: number, rounds: (TokenUsage | undefined)[]): string | undefined {
  const spent = rounds.reduce((sum, usage) => sum + (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0), 0);

  if (budget.maxMs !== undefined && Date.now() - startedAt >= budget.maxMs) return 'max_time';
  if (budget.maxTokens !== undefined && spent >= budget.maxTokens) return 'max_tokens';

  return undefined;
}

/**
 * The nested loop itself. Same act→observe cycle as the parent, minus the
 * pieces that belong to the outer turn: no memory, no ui_calls, no
 * continuations — a delegation either answers or reports why it stopped.
 */
export async function runDelegation(
  name: string,
  sub: SubagentConfig,
  task: string,
  ctx: DelegationContext,
): Promise<DelegationOutcome> {
  // The delegation spends the same allowance the request did: a turn that
  // fans out N subagents costs N more slots of the caller's rate limit.
  if (ctx.limiter && !(await ctx.limiter.allow(ctx.identity))) return { report: { error: 'rate_limited' } };
  const model = sub.model ? resolveModel(sub.model, ctx.env, sub.modelOptions) : ctx.parentModel;

  if (!model) return { report: { error: 'subagent_model_unavailable', subagent: name } };
  // The same guardrail pipeline the parent turn passed: a delegated task is
  // still caller-shaped input, and the processors see it before any model.
  const guarded = await runProcessors(ctx.processors, {
    messages: [
      { role: 'system', content: sub.instructions },
      { role: 'user', content: task },
    ],
  });

  if (guarded.aborted) return { report: { error: 'refused', reason: guarded.aborted.reason } };
  const messages = guarded.messages.filter((message) => message.role !== 'system') as ChatMessage[];
  const tools = subagentSurface(sub, ctx);

  return tracedSubagentTurn(name, model, async (span) => {
    const rounds: (TokenUsage | undefined)[] = [];
    const startedAt = Date.now();
    const finish = (report: Record<string, unknown>): DelegationOutcome => {
      const bill = turnBill(rounds, sub.cost);

      if (bill) span.setAttributes(turnUsageAttributes(bill));

      return { report, bill };
    };

    for (let round = 0; round < sub.budget.maxTurns; round += 1) {
      const cut = budgetCut(sub.budget, startedAt, rounds);

      if (cut) return finish({ stopReason: cut });
      const reply: SubagentRound = await tracedRound(model, sub.cost, () =>
        callProvider(model, sub.instructions, messages, tools, ctx.fetchImpl).catch((error) => ({
          text: '',
          toolCalls: [],
          providerError: String(error),
        })),
      );

      if ('providerError' in reply) return finish({ error: 'provider_error', detail: reply.providerError });
      rounds.push(reply.usage);
      messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });
      if (reply.toolCalls.length === 0) return finish({ text: reply.text });
      for (const call of reply.toolCalls) {
        messages.push({ role: 'tool', toolCallId: call.id, content: await dispatchCall(call, sub, ctx) });
      }
    }

    return finish({ stopReason: 'max_turns' });
  });
}
