import type { AgentDeps, AgentMount } from '@janux/server';
import { createLlmHandler } from './llm-endpoint';
import { resolveModel, setupCard, type ModelEnv } from './model';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type ToolCall } from './providers';

export interface AgentConfig {
  instructions?: string;
  model?: string;
  maxTurns?: number;
  tools?: { include?: string[] };
}

export interface AgentOverrides {
  env?: ModelEnv;
  fetchImpl?: FetchLike;
}

interface AgentRequestBody {
  messages: ChatMessage[];
  path?: string;
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

  return [config.instructions, SYSTEM_PREAMBLE, `Mounted resources: ${resources}`]
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
export function defineAgent(config: AgentConfig = {}, overrides: AgentOverrides = {}): AgentMount {
  const env = overrides.env ?? (process.env as ModelEnv);
  const fetchImpl = overrides.fetchImpl ?? ((url, init) => fetch(url, init));
  const maxTurns = config.maxTurns ?? 6;

  return {
    handleLlm: createLlmHandler(config.model, env, fetchImpl),
    async handle(req: Request, deps: AgentDeps): Promise<Response> {
      const model = resolveModel(config.model, env);

      if (!model) return json(setupCard());
      const body = (await req.json().catch(() => ({ messages: [] }))) as AgentRequestBody;
      const manifest: any = await deps.manifestFor(body.path ?? '/');
      const tools = manifestTools(manifest, config.tools?.include);
      const system = systemPrompt(config, manifest);
      const messages = [...(body.messages ?? [])];

      for (let turn = 0; turn < maxTurns; turn += 1) {
        const reply = await callProvider(model, system, messages, tools, fetchImpl);

        messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });
        if (reply.toolCalls.length === 0) {
          return json({ type: 'text', text: reply.text, messages, model: `${model.provider}/${model.model}` });
        }
        const serverCalls = reply.toolCalls.filter((call) => call.name.startsWith('api.'));
        const uiCalls = reply.toolCalls.filter((call) => !call.name.startsWith('api.'));

        messages.push(...(await runServerCalls(serverCalls, deps)));
        if (uiCalls.length > 0) return json({ type: 'ui_calls', calls: uiCalls, messages });
      }

      return json({ type: 'text', text: 'I could not finish within the turn limit.', messages });
    },
  };
}
