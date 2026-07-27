import { callProvider, openAiPayload, postOpenAi, type AgentTool, type ChatMessage, type FetchLike, type ProviderReply, type ToolCall } from './providers';
import type { ResolvedModel } from './model';
import { sseData } from './sse';

/**
 * One streamed model turn, normalized. The events are what a UI can paint while
 * the turn is still running; the generator's **return value** is the same
 * `ProviderReply` the one-shot `callProvider` produces, so the agent loop that
 * consumes it does not care which path it came through.
 */
export type ProviderStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-start'; id: string; name: string }
  | { type: 'tool-delta'; id: string; delta: string };

interface StreamingCall {
  id: string;
  name: string;
  args: string;
}

function deltaOf(payload: string): any {
  try {
    return JSON.parse(payload).choices?.[0]?.delta;
  } catch {
    // A provider that interleaves comments or keep-alives must not kill the turn.
    return undefined;
  }
}

function startCall(calls: Map<number, StreamingCall>, index: number, part: any): StreamingCall {
  // Un-mangled once, here: every consumer downstream gets the app's own tool name.
  const name = String(part.function?.name ?? '').replace(/__/g, '.');
  const call = { id: part.id ?? `call_${index}`, name, args: '' };

  calls.set(index, call);

  return call;
}

/**
 * OpenAI-compatible streams key tool calls by index; only the first frame carries
 * id and name. Gateways that omit the index exist, and without a fallback two
 * parallel calls merge into one with unparseable arguments.
 */
function* callEvents(parts: any[], calls: Map<number, StreamingCall>): Generator<ProviderStreamEvent> {
  for (const part of parts) {
    const index = part.index ?? calls.size;
    const known = calls.get(index);
    const call = known ?? startCall(calls, index, part);
    const fragment = part.function?.arguments ?? '';

    if (!known) yield { type: 'tool-start', id: call.id, name: call.name };
    call.args += fragment;
    if (fragment) yield { type: 'tool-delta', id: call.id, delta: fragment };
  }
}

/** Arguments arrive as text fragments; a truncated generation must not throw. */
function toToolCall({ id, name, args }: StreamingCall): ToolCall {
  try {
    return { id, name, input: JSON.parse(args || '{}') };
  } catch {
    return { id, name, input: {} };
  }
}

/**
 * Streaming is only implemented for the OpenAI-compatible wire, but the caller
 * must not have to care: a provider without it yields no events and returns the
 * whole turn. The endpoint above stays uniform — whether a stream arrives in
 * pieces is a provider property, not a protocol one.
 */
export async function* streamProvider(
  model: ResolvedModel,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): AsyncGenerator<ProviderStreamEvent, ProviderReply> {
  if (model.provider === 'anthropic') return await callProvider(model, system, messages, tools, fetchImpl, signal);
  const payload = { ...openAiPayload(model, system, messages, tools), stream: true };
  const response = await postOpenAi(model, payload, fetchImpl, signal);

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }
  const calls = new Map<number, StreamingCall>();
  let text = '';

  for await (const chunk of sseData(response.body)) {
    const delta = deltaOf(chunk);

    if (delta?.content) {
      text += delta.content;
      yield { type: 'text', delta: delta.content };
    }
    yield* callEvents(delta?.tool_calls ?? [], calls);
  }

  return { text, toolCalls: [...calls.values()].map(toToolCall) };
}
