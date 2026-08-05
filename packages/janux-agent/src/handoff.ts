import type { ModelCost } from './tracing';
import type { ToolFilter } from './tool-filter';
import type { AgentTool, ChatMessage } from './providers';

/**
 * Handoffs (agent-native parity): transfer the conversation to a named peer
 * agent that answers the user from then on — its own system prompt, its own
 * tool surface, optionally its own model. The transfer keeps the dialogue and
 * drops the noise: tool scaffolding belongs to the agent that produced it,
 * not to the one taking over. The envelope carries `agent: <name>` and the
 * client echoes it back (like `threadId`), so the transfer outlives the turn.
 */
export interface HandoffConfig {
  /** What the transferring model reads to decide when this agent should take over. */
  description: string;
  /** The target's own system prompt — it replaces the parent's. */
  instructions: string;
  /** Defaults to the parent's resolved model. */
  model?: string;
  modelOptions?: Record<string, unknown>;
  /** Prices the target's rounds. Without a model override it falls back to the parent's cost. */
  cost?: ModelCost;
  /** The target's own tool surface — a specialist sees its specialty, not everything. */
  tools?: ToolFilter;
}

export const HANDOFF_PREFIX = 'handoff.';

const REASON_INPUT = {
  type: 'object',
  properties: { reason: { type: 'string', description: 'Why this conversation belongs to that agent.' } },
};

/** One model-visible transfer tool per target, on the root agent's tool list only. */
export function handoffTools(handoffs: Record<string, HandoffConfig> | undefined): AgentTool[] {
  return Object.entries(handoffs ?? {}).map(([name, target]) => ({
    name: `${HANDOFF_PREFIX}${name}`,
    description: `Transfer this conversation to the "${name}" agent. ${target.description} It answers the user from here on.`,
    input: REASON_INPUT,
  }));
}

const UI_RESULTS_PREFIX = '[ui tool results]';

/**
 * What survives a transfer: the dialogue itself. Tool results, assistant
 * tool-call scaffolding and the `[ui tool results]` continuation messages are
 * the previous agent's working notes — noise to the one taking over.
 */
export function filterHandoffHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      !message.toolCalls?.length &&
      // The type says string, but this history came off the wire — anything
      // that is not plain non-empty text is noise by definition.
      typeof message.content === 'string' &&
      message.content !== '' &&
      !message.content.startsWith(UI_RESULTS_PREFIX),
  );
}

/** The transfer note the target reads in place of the dropped scaffolding. */
export function handoffNote(name: string, reason: string): string {
  const because = reason ? ` because: ${reason}` : '';

  return `\n\nThis conversation was just transferred to you, the "${name}" agent${because}. Answer the user directly from here on.`;
}

/**
 * Rounds are priced by the ACTIVE agent: a target with its own cost uses it;
 * one on its own model without a declared cost is unpriced (never billed at
 * the parent's rates); one on the parent's model inherits the parent's cost.
 */
export function handoffCost(target: HandoffConfig, parentCost: ModelCost | undefined): ModelCost | undefined {
  return target.cost ?? (target.model ? undefined : parentCost);
}
