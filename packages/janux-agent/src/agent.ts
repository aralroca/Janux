import type { AgentDeps, AgentMount } from '@janux/server';
import type { HarnessMemory } from './harness/memory';
import type { InputProcessor } from './harness/processors';
import { CLIENT_TOOL_SPECS } from 'janux';
import { runProcessors } from './harness/processors';
import { createRateLimiter, type RateLimitConfig, type RateLimiter } from './harness/rate-limit';
import { createLlmHandler } from './llm-endpoint';
import { resolveModel, setupCard, type ModelEnv } from './model';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';

export interface HarnessConfig {
  /** Thread-aware turns: history from storage, replies remembered. */
  memory?: HarnessMemory;
  /** Guardrail pipeline run before every turn (abort → typed refusal). */
  processors?: InputProcessor[];
  rateLimit?: RateLimitConfig;
  /** Resolves the caller identity (rate-limit key + thread ownership). Default: 'anonymous'. */
  identityFor?: (req: Request) => string | undefined | Promise<string | undefined>;
}

export interface AgentConfig {
  instructions?: string;
  model?: string;
  maxTurns?: number;
  tools?: { include?: string[] };
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

function includeTool(name: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;

  return patterns.some((pattern) =>
    pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

function manifestTools(manifest: any, patterns: string[] | undefined): AgentTool[] {
  return (manifest.tools ?? [])
    .filter((tool: any) => includeTool(tool.name, patterns))
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

async function runServerCalls(calls: ToolCall[], deps: AgentDeps): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];

  for (const call of calls) {
    const content = await deps
      .invoke(call.name, call.input)
      .then((result) => JSON.stringify(result ?? null))
      .catch((error) => JSON.stringify({ error: String(error) }));

    results.push({ role: 'tool', toolCallId: call.id, content });
  }

  return results;
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

  return {
    handleLlm: createLlmHandler(config.model, env, fetchImpl),
    async handle(req: Request, deps: AgentDeps): Promise<Response> {
      const model = resolveModel(config.model, env);

      if (!model) return json(setupCard());
      const rawIdentity = await config.harness?.identityFor?.(req);

      // Fail closed when an identity resolver exists but rejects the caller.
      if (config.harness?.identityFor && rawIdentity === undefined) {
        return json({ type: 'error', error: 'unauthorized' }, 401);
      }
      const identity = rawIdentity ?? 'anonymous';
      if (limiter && !(await limiter.allow(identity))) {
        return json({ type: 'error', error: 'rate_limited' }, 429);
      }
      const body = (await req.json().catch(() => ({ messages: [] }))) as AgentRequestBody & {
        continuation?: boolean;
        toolResults?: { name: string; output: unknown }[];
      };
      const manifest: any = await deps.manifestFor(body.path ?? '/');
      const tools = [
        ...manifestTools(manifest, config.tools?.include),
        ...CLIENT_TOOL_SPECS.map((spec) => ({ name: spec.name, description: spec.description, parameters: spec.parameters })),
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
        turn.messages.push({
          role: 'tool',
          content: JSON.stringify(body.toolResults),
        } as ChatMessage);
      }
      const guarded = await runProcessors(config.harness?.processors ?? [], {
        messages: [{ role: 'system', content: system }, ...turn.messages],
      });

      if (guarded.aborted) {
        return json({ type: 'refusal', reason: guarded.aborted.reason, threadId: turn.threadId }, 200);
      }
      const messages = guarded.messages.filter((message) => message.role !== 'system') as ChatMessage[];

      for (let round = 0; round < maxTurns; round += 1) {
        const reply = await callProvider(model, system, messages, tools, fetchImpl);

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
        const uiCalls = reply.toolCalls.filter((call) => !call.name.startsWith('api.'));

        messages.push(...(await runServerCalls(serverCalls, deps)));
        if (uiCalls.length > 0) return json({ type: 'ui_calls', calls: uiCalls, messages, threadId: turn.threadId });
      }

      return json({ type: 'text', text: 'I could not finish within the turn limit.', messages, threadId: turn.threadId });
    },
  };
}
