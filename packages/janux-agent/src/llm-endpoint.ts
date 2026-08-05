import { resolveModel, setupCard, type ModelEnv } from './model';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';
import { streamProvider } from './provider-stream';
import { replayResponse, streamingResponse, turnChunks } from './llm-stream';
import type { ResumableStreams, StreamFrame } from './harness/resumable';

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

/** The cursor a returning reader names: the last `id:` it actually received. */
function cursorOf(req: Request): number {
  const header = req.headers.get('last-event-id');

  return header === null ? -1 : Number(header);
}

/**
 * A resume reads an existing turn instead of buying a new one, so GET would
 * describe it better — but `/_janux/llm` is an invocation path, and those are
 * POST-only precisely so no `<img>`, `<script>` or `EventSource` on another
 * origin can reach them with the visitor's ambient cookies. An answer being
 * written for someone is exactly the kind of thing that must not be readable
 * that way, so the resume goes through the same door as everything else.
 */
function resumeStream(streamId: string, req: Request, streams: ResumableStreams, identity: string): Response {
  const resumed = streams.resume(streamId, identity, cursorOf(req));

  // A stream that expired, never existed, or belongs to someone else answers
  // the same way: the id is a guess either way, and only one of those answers
  // is safe to confirm.
  if (resumed === 'stream_not_found') return json({ type: 'error', error: 'stream_not_found' }, 404);
  if (resumed === 'stream_not_resumable') return json({ type: 'error', error: 'stream_not_resumable' }, 422);

  return replayResponse(resumed, streamId);
}

/** Opens the log for this turn, so a reader that leaves has something to come back to. */
function sinkFor(streams: ResumableStreams | undefined, streamId: string, owner: string) {
  if (!streams) return undefined;
  streams.open(streamId, owner);

  return {
    append: (frame: StreamFrame) => streams.append(streamId, frame),
    close: () => streams.close(streamId),
  };
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
  streams?: ResumableStreams,
) {
  return async (req: Request): Promise<Response> => {
    // POST-only: an EventSource (or a crawler) issuing GET would otherwise buy a
    // billed provider turn for an empty transcript.
    if (req.method !== 'POST') return json({ type: 'error', error: 'method_not_allowed' }, 405);
    // Gate first, same as /_janux/agent: an unconfigured model must not open
    // the door to unauthorized or unmetered callers. Resuming runs it too —
    // replaying is cheaper than generating, but it must not be the cheap door
    // around the limiter, and the identity is what proves the stream is yours.
    const gated = await gate?.(req);

    if (gated instanceof Response) return gated;
    const streamId = new URL(req.url).searchParams.get('stream');

    if (streams && streamId) return resumeStream(streamId, req, streams, gated ?? 'anonymous');
    const resolved = resolveModel(config.model, env, config.modelOptions);

    if (!resolved) return json(setupCard(), 503);
    // Honest about what it cannot do: without retention, a client asking to
    // resume is told the stream is gone rather than silently handed a second,
    // duplicate turn.
    if (!streams && req.headers.get('last-event-id')) {
      return json({ type: 'error', error: 'stream_not_resumable' }, 422);
    }
    const body = (await req.json().catch(() => ({}))) as WireBody;
    const messages = body.messages ?? [];
    const system = systemOf(messages);
    const chat = toChatMessages(messages);
    const tools = toAgentTools(body.tools ?? []);

    if (wantsStream(req, body)) {
      // No `req.signal`: a retained turn outlives the request that started it,
      // which is the entire point — the reload that aborted this socket is the
      // reader coming back for the rest.
      const turn = streamProvider(resolved, system, chat, tools, fetchImpl, streams ? undefined : req.signal);
      const streamId = crypto.randomUUID();

      return streamingResponse(turnChunks(turn), streamId, sinkFor(streams, streamId, gated ?? 'anonymous'));
    }
    const reply = await callProvider(resolved, system, chat, tools, fetchImpl);

    return json({ text: reply.text, toolCalls: toWireCalls(reply.toolCalls) });
  };
}
