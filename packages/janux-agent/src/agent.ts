import type { AgentDeps, AgentMount } from '@janux/server';
import type { JanuxSpan } from 'janux/observability';
import type { HarnessMemory } from './harness/memory';
import type { InputProcessor } from './harness/processors';
import { filterHandoffHistory, handoffCost, handoffNote, handoffTools, HANDOFF_PREFIX, type HandoffConfig } from './handoff';
import { CLIENT_TOOL_SPECS } from 'janux';
import { runProcessors } from './harness/processors';
import { createRateLimiter, type RateLimitConfig, type RateLimiter } from './harness/rate-limit';
import { createLlmHandler } from './llm-endpoint';
import { createRemoteToolbox, type McpAgentConnection, type RemoteToolbox } from './mcp-tools';
import { resolveModel, setupCard, type ModelEnv, type ResolvedModel } from './model';
import { tracedAgentTurn, tracedRound, turnUsageAttributes, type ModelCost } from './tracing';
import { allowsTool, type ToolFilter } from './tool-filter';
import { loadSkillBody, loadSkillTools, skillsSection, LOAD_SKILL } from './skills';
import type { ManifestSkill } from 'janux/manifest';
import { DELEGATE_PREFIX, delegationTools, runDelegation, validateSubagents, type SubagentConfig } from './subagents';
import { combineBills, turnBill, type TurnBill } from './usage';
import { callProvider, type AgentTool, type ChatMessage, type FetchLike, type TokenUsage, type ToolCall } from './providers';

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
  /**
   * What this model costs, in USD per million tokens. Declaring it is what puts
   * `janux.cost.usd` on every turn's span — Janux ships no price table, because
   * a bundled one is wrong the week after it is written.
   */
  cost?: ModelCost;
  /** Which mounted tools reach the model. Same semantics as `createCopilot({ tools })`. */
  tools?: ToolFilter;
  /** Remote MCP server(s) whose tools join the agent's tool list. */
  mcp?: McpAgentConnection | McpAgentConnection[];
  /**
   * Named delegates the model can hand a focused subtask to via
   * `delegate.<name>`. Each runs its own server-side loop under a MANDATORY
   * budget, on a tool surface that never exceeds this agent's own.
   */
  subagents?: Record<string, SubagentConfig>;
  /**
   * Named peer agents the model can transfer the conversation to via
   * `handoff.<name>`. The target answers the user from then on; the envelope
   * carries `agent: <name>` and the client echoes it back like `threadId`.
   */
  handoffs?: Record<string, HandoffConfig>;
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
  /** After a handoff: keep talking to this target agent. */
  agent?: string;
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

/** Own-property lookup only: model- and caller-supplied names must never resolve down the prototype chain. */
function declared<T>(map: Record<string, T> | undefined, name: string): T | undefined {
  return map && Object.hasOwn(map, name) ? map[name] : undefined;
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

  return [config.instructions, SYSTEM_PREAMBLE, `Mounted resources: ${resources}`, routeMap, skillsSection(manifestSkills(manifest))]
    .filter(Boolean)
    .join('\n\n');
}

function manifestSkills(manifest: any): ManifestSkill[] {
  return (manifest.skills ?? []) as ManifestSkill[];
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
  validateSubagents(config.subagents);
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
      if (body.agent && !declared(config.handoffs, body.agent)) {
        return json({ type: 'error', error: 'unknown_agent', message: `No agent "${body.agent}" is declared for handoff.` }, 400);
      }
      const manifest: any = await deps.manifestFor(body.path ?? '/');
      const remoteTools = toolbox ? await toolbox.tools() : [];
      const skills = manifestSkills(manifest);
      // The composition tools (delegate/handoff) belong to the root agent
      // only: a handoff target answers on its own surface, it does not chain.
      const toolsFor = (filter: ToolFilter | undefined, root: boolean): AgentTool[] => [
        ...manifestTools(manifest, filter),
        ...CLIENT_TOOL_SPECS.map((spec) => ({ name: spec.name, description: spec.description, input: spec.parameters })),
        ...remoteTools.map(({ name, description, input }) => ({ name, description, input })),
        ...(root ? [...delegationTools(config.subagents), ...handoffTools(config.handoffs)] : []),
        ...loadSkillTools(skills),
      ];
      const systemFor = (target: HandoffConfig | undefined) =>
        target ? systemPrompt({ ...config, instructions: target.instructions }, manifest) : systemPrompt(config, manifest);

      // The turn's acting agent: the root, or — sticky across turns, or mid-
      // turn after a transfer — one of the declared handoff targets.
      let active = body.agent ? { name: body.agent, target: declared(config.handoffs, body.agent)! } : undefined;
      const resolvedActive = active?.target.model ? resolveModel(active.target.model, env, active.target.modelOptions) : model;

      if (!resolvedActive) return json({ type: 'error', error: 'handoff_model_unavailable' }, 502);
      let activeModel: ResolvedModel = resolvedActive;
      let tools = toolsFor(active ? active.target.tools : config.tools, !active);
      let system = systemFor(active?.target);
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
      // One segment of rounds per acting agent: a handoff starts a new one so
      // each side of the transfer is priced by its own model's cost.
      const segments: { rounds: (TokenUsage | undefined)[]; cost?: ModelCost }[] = [
        { rounds: [], cost: active ? handoffCost(active.target, config.cost) : config.cost },
      ];
      const delegated: TurnBill[] = [];
      // Turn accounting in the envelope itself, so callers (the eval runner
      // included) can bill a turn without a tracer anywhere. Delegations are
      // part of what the turn cost the caller, so their bills join the total.
      const turnTotal = () => combineBills(segments.map((segment) => turnBill(segment.rounds, segment.cost)));
      const billed = () => {
        const bill = combineBills([turnTotal(), ...delegated]);

        return bill ? { usage: bill } : {};
      };
      const delegate = async (call: ToolCall) => {
        const name = call.name.slice(DELEGATE_PREFIX.length);
        const sub = declared(config.subagents, name);

        // Subagents belong to the root agent: a handoff target that asks for
        // one is out of its surface, the same as any other undeclared tool.
        if (active || !sub) return { error: `unknown_subagent: ${name}` };
        const outcome = await runDelegation(name, sub, String((call.input as { task?: unknown })?.task ?? ''), {
          deps,
          manifest,
          env,
          fetchImpl,
          parentModel: model,
          parentTools: config.tools,
          remoteTools: remoteTools.map(({ name: toolName, description, input }) => ({ name: toolName, description, input })),
          callRemote: toolbox ? (toolName, input) => toolbox.call(toolName, input) : undefined,
          ownsRemote: (toolName) => toolbox?.owns(toolName) ?? false,
          processors: config.harness?.processors ?? [],
          limiter,
          identity,
        });

        if (outcome.bill) delegated.push(outcome.bill);

        return outcome.report;
      };

      const runLoop = async (span: JanuxSpan): Promise<Response> => {
        for (let round = 0; round < maxTurns; round += 1) {
          const reply = await tracedRound(activeModel, segments.at(-1)!.cost, () =>
            callProvider(activeModel, system, messages, tools, fetchImpl).catch((error) => ({
              text: '',
              toolCalls: [],
              providerError: String(error),
            })),
          );

          if ('providerError' in reply) {
            return json({ type: 'error', error: 'provider_error', detail: reply.providerError, threadId: turn.threadId, ...billed() }, 502);
          }

          segments.at(-1)!.rounds.push(reply.usage);
          messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });
          if (reply.toolCalls.length === 0) {
            await turn.rememberReply?.(reply.text);

            return json({
              type: 'text',
              text: reply.text,
              messages,
              threadId: turn.threadId,
              model: `${activeModel.provider}/${activeModel.model}`,
              ...(active && { agent: active.name }),
              ...billed(),
            });
          }
          // A transfer preempts the round: the target takes the conversation
          // — dialogue kept, tool noise dropped — and answers from here on.
          const transferCall = active
            ? undefined
            : reply.toolCalls.find((call) => call.name.startsWith(HANDOFF_PREFIX) && declared(config.handoffs, call.name.slice(HANDOFF_PREFIX.length)));

          if (transferCall) {
            const name = transferCall.name.slice(HANDOFF_PREFIX.length);
            const target = declared(config.handoffs, name)!;
            const nextModel = target.model ? resolveModel(target.model, env, target.modelOptions) : model;

            if (!nextModel) return json({ type: 'error', error: 'handoff_model_unavailable', threadId: turn.threadId, ...billed() }, 502);
            active = { name, target };
            activeModel = nextModel;
            segments.push({ rounds: [], cost: handoffCost(target, config.cost) });
            messages.splice(0, messages.length, ...filterHandoffHistory(messages));
            system = systemFor(target) + handoffNote(name, String((transferCall.input as { reason?: unknown })?.reason ?? ''));
            tools = toolsFor(target.tools, false);
            span.setAttributes({ 'janux.handoff.to': name, 'gen_ai.agent.name': name });
            continue;
          }
          const serverCalls = reply.toolCalls.filter((call) => call.name.startsWith('api.'));
          const remoteCalls = reply.toolCalls.filter((call) => toolbox?.owns(call.name));
          // Loading a skill is a read the server already holds the answer to: it
          // never travels to the browser as a ui call, and never runs a tool.
          const skillCalls = reply.toolCalls.filter((call) => call.name === LOAD_SKILL);
          const delegateCalls = reply.toolCalls.filter((call) => call.name.startsWith(DELEGATE_PREFIX));
          // A handoff call that did not transfer (invented name, or a target
          // trying to chain) is refused like any other undeclared tool.
          const handoffCalls = reply.toolCalls.filter((call) => call.name.startsWith(HANDOFF_PREFIX));
          const handled = [...serverCalls, ...remoteCalls, ...skillCalls, ...delegateCalls, ...handoffCalls];
          const uiCalls = reply.toolCalls.filter((call) => !handled.includes(call));

          messages.push(...(await toolResults(serverCalls, (call) => deps.invoke(call.name, call.input))));
          messages.push(...(await toolResults(remoteCalls, (call) => toolbox!.call(call.name, call.input))));
          messages.push(...(await toolResults(skillCalls, async (call) => loadSkillBody(call.input, skills, deps))));
          messages.push(...(await toolResults(delegateCalls, delegate)));
          messages.push(
            ...(await toolResults(handoffCalls, async (call) => ({ error: `unknown_agent: ${call.name.slice(HANDOFF_PREFIX.length)}` }))),
          );
          if (uiCalls.length > 0) {
            return json({ type: 'ui_calls', calls: uiCalls, messages, threadId: turn.threadId, ...(active && { agent: active.name }), ...billed() });
          }
        }

        // `stopReason` because giving up wears the same `type: 'text'` as a real
        // answer: without it an eval step reads an exhausted loop as a success.
        return json({
          type: 'text',
          text: 'I could not finish within the turn limit.',
          stopReason: 'max_turns',
          messages,
          threadId: turn.threadId,
          ...(active && { agent: active.name }),
          ...billed(),
        });
      };

      // The whole turn is one span: every round and every tool the model
      // reached for hangs off it, so a trace reads as one conversation —
      // with the turn's total tokens and price on the span that frames it.
      return tracedAgentTurn(model, async (span) => {
        if (active) span.setAttributes({ 'gen_ai.agent.name': active.name });
        const response = await runLoop(span);
        const bill = turnTotal();

        if (bill) span.setAttributes(turnUsageAttributes(bill));

        return response;
      });
    },
  };
}
