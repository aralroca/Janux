import { withSpan, type JanuxSpan, type SpanAttributes } from 'janux/observability';
import type { ResolvedModel } from './model';
import type { ProviderReply } from './providers';

/**
 * The agent half of the trace, following the OpenTelemetry GenAI semantic
 * conventions — so a Janux copilot lands in the same dashboards as every other
 * instrumented LLM caller, with the `janux.*` spans of the tools it invoked
 * nested underneath it.
 *
 * Deliberately absent: `gen_ai.input.messages` / `gen_ai.output.messages`.
 * They are opt-in in the spec and stay off here, because the transcript is the
 * one field guaranteed to contain whatever the user typed.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

/** Price in USD per MILLION tokens — the unit every provider publishes. */
export interface ModelCost {
  input: number;
  output: number;
}

/** OTel's provider enum is open; only Google's canonical name differs from ours. */
const PROVIDER_NAMES: Record<string, string> = { google: 'gcp.gemini' };

function baseAttributes(model: ResolvedModel, operation: string): SpanAttributes {
  return {
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': PROVIDER_NAMES[model.provider] ?? model.provider,
    'gen_ai.request.model': model.model,
  };
}

function usdCost(reply: ProviderReply, cost?: ModelCost): number | undefined {
  if (!cost || !reply.usage) return undefined;
  const { inputTokens = 0, outputTokens = 0 } = reply.usage;

  return (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000;
}

/** Tokens are semconv; the price is ours, because no convention defines one. */
function replyAttributes(reply: ProviderReply, cost?: ModelCost): SpanAttributes {
  return {
    'gen_ai.response.model': reply.model,
    'gen_ai.usage.input_tokens': reply.usage?.inputTokens,
    'gen_ai.usage.output_tokens': reply.usage?.outputTokens,
    'janux.cost.usd': usdCost(reply, cost),
  };
}

type Round = ProviderReply | { providerError: string };

function settle(span: JanuxSpan, reply: Round, cost?: ModelCost): void {
  if (!('providerError' in reply)) return span.setAttributes(replyAttributes(reply, cost));
  span.setAttributes({ 'error.type': 'provider_error' });
  span.recordError(new Error(reply.providerError));
}

/** The whole turn: every round of the loop and every tool it called hang off this span. */
export function tracedAgentTurn<T>(model: ResolvedModel, run: () => Promise<T>): Promise<T> {
  return withSpan('invoke_agent janux', () => baseAttributes(model, 'invoke_agent'), run);
}

/** One round: the model call itself, priced. Tools the model asked for are traced by their own pipeline. */
export function tracedRound(model: ResolvedModel, cost: ModelCost | undefined, run: () => Promise<Round>): Promise<Round> {
  return withSpan(`chat ${model.model}`, () => baseAttributes(model, 'chat'), async (span) => {
    const reply = await run();

    settle(span, reply, cost);

    return reply;
  });
}
