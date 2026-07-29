import type { AgentDeps, AgentMount } from '@janux/server';
import type { HarnessMemory } from './harness/memory';
import type { InputProcessor } from './harness/processors';
import { CLIENT_TOOL_SPECS } from 'janux';
import { runProcessors } from './harness/processors';
import { createRateLimiter, type RateLimitConfig, type RateLimiter } from './harness/rate-limit';
import { createLlmHandler } from './llm-endpoint';
import { createRemoteToolbox, type McpAgentConnection, type RemoteToolbox } from './mcp-tools';
import { resolveModel, setupCard, type ModelEnv } from './model';
import { allowsTool, type ToolFilter } from './tool-filter';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';

export interface HarnessConfig {
  /** Thread-aware turns: history from storage, replies remembered. */
  memory?: HarnessMemory;
  /** Guardrail pipeline run before every turn (abort → typed refusal). */
  processors?: InputProcessor[];
  rateLimit?: RateLimitConfig;
  /** Resolves the caller identity (rate-limit key + thread ownership). Default: 'anonymous'. */
  identityFor?: (req: Request) => string | undefined | Promise<string | undefined>;
  /** Human-readable reply on a guardrail refusal — a string or a per-reason factory. */
  refusalMessage?: string | ((reason: string) => string);
}

export interface AgentConfig {
  instructions?: string;
  model?: string;
  /**
   * Extra provider fields merged into every model request — `{ reasoning: { enabled: false } }`
   * and `{ provider: { sort: 'throughput' } }` on OpenRouter, `temperature`, … The framework's
   * own fields (model, messages, tools) always win.
   */
  modelOptions?: Record<string, unknown>;
  maxTurns?: number;
  /** Which mounted tools reach the model. Same semantics as `createCopilot({ tools })`. */
  tools?: ToolFilter;
  /** Remote MCP server(s) whose tools join the agent's tool list. */
  mcp?: McpAgentConnection | McpAgentConnection[];
  harness?: HarnessConfig;
}

export interface AgentOverrides {
  env?: ModelEnv;
  fetchImpl?: FetchLike;
}

interface AgentRequestBody {
  messages: ChatMessage[];
  path?: string;
  /** Thread-aware turns (harness.memory): resume this conversation. */
  threadId?: string;
}

const SYSTEM_PREAMBLE = [
  'You are the built-in copilot of a Janux application.',
  'Tools prefixed "api." run on the server. All other tools operate the live UI;',
  'tools marked [guard:confirm] return a proposal the human approves on the real UI.',
  'Read resource state before acting. Never invent tool names.',
].join(' ');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function manifestTools(manifest: any, filter: ToolFilter | undefined): AgentTool[] {
  return (manifest.tools ?? [])
    .filter((tool: any) => allowsTool(tool.name, filter))
    .map((tool: any) => ({
      name: tool.name,
      description: `${tool.description ?? ''} [guard:${tool.guard}]`.trim(),
      input: tool.input,
    }));
}

function systemPrompt(config: AgentConfig, manifest: any): string {
  const resources = JSON.stringify(manifest.resources ?? []);
  const routes = (manifest.routes ?? []) as string[];
  const routeMap = routes.length
    ? `App routes (use ui_navigate to reach any of them; fill [params] with known values): ${routes.join(', ')}`
    : undefined;

  return [config.instructions, SYSTEM_PREAMBLE, `Mounted resources: ${resources}`, routeMap]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Identity + rate limit, shared by both mounts. `/_janux/llm` is a model proxy
 * with the app's key behind it: leaving it ungated while `/_janux/agent` is
 * protected means the cheapest way to spend someone's budget is the other door.
 * A `Response` back means rejected; a string is the caller's identity.
 */
function createGate(config: AgentConfig, limiter: RateLimiter | undefined) {
  return async (req: Request): Promise<Response | string> => {
    const raw = await config.harness?.identityFor?.(req);

    // Fail closed when an identity resolver exists but rejects the caller. The
    // `message` is what a UI shows: a refusal a person can act on beats a code.
    if (config.harness?.identityFor && raw === undefined) {
      return json({ type: 'error', error: 'unauthorized', message: 'Not authorized to use this agent.' }, 401);
    }
    const identity = raw ?? 'anonymous';

    if (limiter && !(await limiter.allow(identity))) {
      const message = 'Too many questions right now — give it a minute and try again.';

      return json({ type: 'error', error: 'rate_limited', message }, 429);
    }

    return identity;
  };
}

async function toolResults(calls: ToolCall[], run: (call: ToolCall) => Promise<unknown>): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];

  for (const call of calls) {
    const content = await run(call)
      .then((result) => JSON.stringify(result ?? null))
      .catch((error) => JSON.stringify({ error: String(error) }));

    results.push({ role: 'tool', toolCallId: call.id, content });
  }

  return results;
}

const DEFAULT_REFUSAL = "I can't help with that request.";

function refusalText(harness: HarnessConfig | undefined, reason: string): string {
  const custom = harness?.refusalMessage;

  if (typeof custom === 'function') return custom(reason);

  return custom ?? DEFAULT_REFUSAL;
}

/**
 * Zero-config embedded agent. Stateless HTTP turn protocol:
 * - `{type:'text'}` final answer;
 * - `{type:'ui_calls'}` the client executes via the gui-agent bridge and re-POSTs;
 * - `{type:'setup'}` when no model/provider is configured.
 */
/** History + incoming turn for a thread-aware request; falls back to the stateless protocol. */
async function turnMessages(
  body: AgentRequestBody,
  harness: HarnessConfig | undefined,
  identity: string,
): Promise<{ messages: ChatMessage[]; threadId?: string; rememberReply?: (text: string) => Promise<void> }> {
  const memory = harness?.memory;
  const incoming = body.messages ?? [];

  if (!memory) return { messages: [...incoming] };
  const thread = await memory.ensureThread(body.threadId, identity);
  const latest = incoming.at(-1);

  // Clients in thread mode send only the NEW user message; history is ours.
  if (latest?.role === 'user') await memory.remember(thread, 'user', latest.content);
  const messages = await memory.history(thread.id);

  return {
    messages,
    threadId: thread.id,
    rememberReply: (text) => memory.remember(thread, 'assistant', text),
  };
}

export function defineAgent(config: AgentConfig = {}, overrides: AgentOverrides = {}): AgentMount {
  const env = overrides.env ?? (process.env as ModelEnv);
  const fetchImpl = overrides.fetchImpl ?? ((url, init) => fetch(url, init));
  const maxTurns = config.maxTurns ?? 6;
  const limiter: RateLimiter | undefined = config.harness?.rateLimit
    ? createRateLimiter(config.harness.rateLimit)
    : undefined;
  const gate = createGate(config, limiter);
  const toolbox: RemoteToolbox | undefined = createRemoteToolbox(config.mcp, fetchImpl);

  return {
    handleLlm: createLlmHandler(config, env, fetchImpl, gate),
    async handle(req: Request, deps: AgentDeps): Promise<Response> {
      // The gate runs first, always: a missing model is a configuration state,
      // not a reason to answer an unauthorized caller or to stop counting.
      const identity = await gate(req);

      if (identity instanceof Response) return identity;
      const model = resolveModel(config.model, env, config.modelOptions);

      if (!model) return json(setupCard());
      const body = (await req.json().catch(() => ({ messages: [] }))) as AgentRequestBody & {
        continuation?: boolean;
        toolResults?: { name: string; output: unknown }[];
      };
      const manifest: any = await deps.manifestFor(body.path ?? '/');
      const remoteTools = toolbox ? await toolbox.tools() : [];
      const tools = [
        ...manifestTools(manifest, config.tools),
        ...CLIENT_TOOL_SPECS.map((spec) => ({ name: spec.name, description: spec.description, input: spec.parameters })),
        ...remoteTools.map(({ name, description, input }) => ({ name, description, input })),
      ];
      const system = systemPrompt(config, manifest);
      const turn = await turnMessages(body, config.harness, identity).catch((error) => {
        if (String(error).includes('thread_forbidden')) return undefined;
        throw error;
      });

      if (!turn) return json({ type: 'error', error: 'thread_forbidden' }, 403);
      // act -> observe -> continue: the client executed the returned ui_calls
      // and re-POSTs their outputs with the (possibly new) path — the manifest
      // above is already the destination page's, so the turn continues with
      // the tools that exist THERE.
      if (body.continuation && body.toolResults) {
        // Provider-agnostic observation: OpenAI-style APIs reject bare `tool`
        // messages without a matching tool_call id, so the executed results
        // travel as a labeled user message inside the SAME turn.
        turn.messages.push({
          role: 'user',
          content: `[ui tool results] ${JSON.stringify(body.toolResults)}`,
        } as ChatMessage);
      }
      const guarded = await runProcessors(config.harness?.processors ?? [], {
        messages: [{ role: 'system', content: system }, ...turn.messages],
      });

      if (guarded.aborted) {
        const { reason } = guarded.aborted;

        return json({ type: 'refusal', reason, message: refusalText(config.harness, reason), threadId: turn.threadId }, 200);
      }
      const messages = guarded.messages.filter((message) => message.role !== 'system') as ChatMessage[];

      for (let round = 0; round < maxTurns; round += 1) {
        const reply = await callProvider(model, system, messages, tools, fetchImpl).catch((error) => ({
          text: '',
          toolCalls: [],
          providerError: String(error),
        }));

        if ('providerError' in reply) {
          return json({ type: 'error', error: 'provider_error', detail: reply.providerError, threadId: turn.threadId }, 502);
        }

        messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });
        if (reply.toolCalls.length === 0) {
          await turn.rememberReply?.(reply.text);

          return json({
            type: 'text',
            text: reply.text,
            messages,
            threadId: turn.threadId,
            model: `${model.provider}/${model.model}`,
          });
        }
        const serverCalls = reply.toolCalls.filter((call) => call.name.startsWith('api.'));
        const remoteCalls = reply.toolCalls.filter((call) => toolbox?.owns(call.name));
        const uiCalls = reply.toolCalls.filter((call) => !serverCalls.includes(call) && !remoteCalls.includes(call));

        messages.push(...(await toolResults(serverCalls, (call) => deps.invoke(call.name, call.input))));
        messages.push(...(await toolResults(remoteCalls, (call) => toolbox!.call(call.name, call.input))));
        if (uiCalls.length > 0) return json({ type: 'ui_calls', calls: uiCalls, messages, threadId: turn.threadId });
      }

      return json({ type: 'text', text: 'I could not finish within the turn limit.', messages, threadId: turn.threadId });
    },
  };
}
