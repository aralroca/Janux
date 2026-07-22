import { resolveModel, setupCard, type ModelEnv } from './model';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';

/** One turn of the gui-agent remote-Llm protocol: `{ messages, tools }` in, `{ text, toolCalls }` out. */
interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: WireToolCall[];
  toolCallId?: string;
}

interface WireToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface WireTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface WireBody {
  messages?: WireMessage[];
  tools?: WireTool[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function systemOf(messages: WireMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
}

function toChatMessages(messages: WireMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role as ChatMessage['role'],
      content: message.content,
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls?.map(({ id, name, arguments: input }) => ({ id, name, input })),
    }));
}

function toAgentTools(tools: WireTool[]): AgentTool[] {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, input: inputSchema }));
}

function toWireCalls(toolCalls: ToolCall[]): WireToolCall[] {
  return toolCalls.map(({ id, name, input }) => ({
    id,
    name,
    arguments: (input ?? {}) as Record<string, unknown>,
  }));
}

/**
 * The `/_janux/llm` mount: a stateless single-turn proxy for browser-side
 * agent loops (`serverLlm()` from `@janux/agent/local`). The loop and the
 * tools stay in the page; only the model call crosses the wire.
 */
export function createLlmHandler(model: string | undefined, env: ModelEnv, fetchImpl: FetchLike) {
  return async (req: Request): Promise<Response> => {
    const resolved = resolveModel(model, env);

    if (!resolved) return json(setupCard(), 503);
    const body = (await req.json().catch(() => ({}))) as WireBody;
    const messages = body.messages ?? [];
    const reply = await callProvider(
      resolved,
      systemOf(messages),
      toChatMessages(messages),
      toAgentTools(body.tools ?? []),
      fetchImpl,
    );

    return json({ text: reply.text, toolCalls: toWireCalls(reply.toolCalls) });
  };
}
