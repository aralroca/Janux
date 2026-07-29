import { resolveModel, setupCard, type ModelEnv } from './model';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';
import { streamProvider } from './provider-stream';
import { streamingResponse, turnChunks } from './llm-stream';

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
  stream?: boolean;
}

/** Either header or body opts in, so a plain `fetch` and an SSE client both work. */
function wantsStream(req: Request, body: WireBody): boolean {
  return body.stream === true || (req.headers.get('accept') ?? '').includes('text/event-stream');
}

/** The slice of `AgentConfig` this mount needs; `defineAgent` hands it its own. */
export interface LlmHandlerConfig {
  model?: string;
  modelOptions?: Record<string, unknown>;
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
export function createLlmHandler(
  config: LlmHandlerConfig,
  env: ModelEnv,
  fetchImpl: FetchLike,
  gate?: (req: Request) => Promise<Response | string>,
) {
  return async (req: Request): Promise<Response> => {
    // POST-only: an EventSource (or a crawler) issuing GET would otherwise buy a
    // billed provider turn for an empty transcript.
    if (req.method !== 'POST') return json({ type: 'error', error: 'method_not_allowed' }, 405);
    // Gate first, same as /_janux/agent: an unconfigured model must not open
    // the door to unauthorized or unmetered callers.
    const gated = await gate?.(req);

    if (gated instanceof Response) return gated;
    const resolved = resolveModel(config.model, env, config.modelOptions);

    if (!resolved) return json(setupCard(), 503);
    // Honest about what it cannot do: a client asking to resume gets told the
    // stream is gone instead of silently receiving a second, duplicate turn.
    if (req.headers.get('last-event-id')) return json({ type: 'error', error: 'stream_not_resumable' }, 422);
    const body = (await req.json().catch(() => ({}))) as WireBody;
    const messages = body.messages ?? [];
    const system = systemOf(messages);
    const chat = toChatMessages(messages);
    const tools = toAgentTools(body.tools ?? []);

    if (wantsStream(req, body)) {
      const turn = streamProvider(resolved, system, chat, tools, fetchImpl, req.signal);

      return streamingResponse(turnChunks(turn), crypto.randomUUID());
    }
    const reply = await callProvider(resolved, system, chat, tools, fetchImpl);

    return json({ text: reply.text, toolCalls: toWireCalls(reply.toolCalls) });
  };
}
