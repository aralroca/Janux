import type { Ctx } from 'janux';
import type { ApiTool } from './api';
import { callableTools, refuseUnauthenticated, type HostedAuth } from './agent-surface';
import { agentCard, PROCEDURE_PREFIX } from './a2a-card';
import { completedTask, createTaskStore, failedTask, freshId, taskOf, type ParkedTask, type Task } from './a2a-task';
import type { Skill } from './skills';

/**
 * Hosted A2A endpoint: `/_janux/a2a` speaks the Agent2Agent protocol over its
 * JSON-RPC binding, so an outside *agent* can use this app the way an outside
 * *model* uses `/_janux/mcp`.
 *
 * It is a second protocol, never a second pipeline. Discovery goes through the
 * same `callableTools` the MCP listing and the page manifest use, and every
 * invocation goes through the same `invoke` seam — which means the same guards,
 * the same scope checks, the same proposals and the same audit entries. An
 * agent that arrives by A2A cannot be handed anything an agent arriving by MCP
 * would be refused, because there is nothing else here to hand it.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

export const A2A_PATH = '/_janux/a2a';

export interface A2aDeps {
  serverName: string;
  /** What the app already says about itself (`llmsTxt.description`). */
  description?: string;
  tools: ApiTool[];
  invoke(tool: string, input: unknown, ctx: Ctx): Promise<unknown>;
  skills?: readonly Skill[];
  /** The same bearer gate as the MCP endpoint: one door policy for both protocols. */
  auth?: HostedAuth;
  /** Public origin the card advertises; falls back to the origin the request arrived on. */
  siteUrl?: string;
}

interface RpcRequest {
  id?: number | string | null;
  method: string;
  params?: any;
}

type Reply = { result: unknown } | { error: { code: number; message: string } };

/** Operations A2A defines that a stateless, non-streaming endpoint does not offer (§5.4). */
const UNSUPPORTED = new Set([
  'SendStreamingMessage',
  'SubscribeToTask',
  'CancelTask',
  'ListTasks',
  'GetExtendedAgentCard',
  'CreateTaskPushNotificationConfig',
  'GetTaskPushNotificationConfig',
  'ListTaskPushNotificationConfigs',
  'DeleteTaskPushNotificationConfig',
]);

const NEEDS_DATA_PART =
  'This agent exchanges structured data: send one DataPart {"skill": <skill id>, "input": <object>}. ' +
  'See the tool-invocation extension on /.well-known/agent-card.json.';

const isProposal = (value: unknown): value is { status: 'proposal'; id: string; tool: string; input: unknown } =>
  typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'proposal';

/** The one structured part a message must carry. Anything else is a conversation this agent cannot have. */
function invocationOf(parts: unknown): Record<string, unknown> | undefined {
  const part = (Array.isArray(parts) ? parts : []).find(
    (candidate) => typeof candidate?.data === 'object' && candidate.data !== null,
  );

  return part?.data;
}

function procedureTask(id: string, contextId: string, skills: readonly Skill[]): Task {
  const body = skills.find((skill) => `${PROCEDURE_PREFIX}${skill.name}` === id)?.body;

  if (body === undefined) return failedTask(freshId(), contextId, new Error(`Unknown skill "${id}"`));

  return completedTask(freshId(), contextId, id, { text: body });
}

export function createA2aEndpoint(deps: A2aDeps) {
  const tasks = createTaskStore();

  /**
   * The proposal, mirrored as the task that tracks it.
   *
   * The task gets an id of its own rather than reusing the proposal's. The bare
   * proposal id travels in spans and audit entries precisely because on its own
   * it grants nothing; naming the task after it would have made it grant one
   * thing — a read of whatever the approved call returned.
   */
  const park = (proposal: { id: string; tool: string; input: unknown }, contextId: string): Task => {
    const id = freshId();
    const record: ParkedTask = { contextId, tool: proposal.tool, input: proposal.input, proposal: proposal.id };

    tasks.park(id, record);

    return taskOf(id, record);
  };

  const runSkill = async (skill: string, input: unknown, contextId: string, ctx: Ctx): Promise<Task> => {
    if (skill.startsWith(PROCEDURE_PREFIX)) return procedureTask(skill, contextId, deps.skills ?? []);

    try {
      const result = await deps.invoke(skill, input ?? {}, ctx);

      if (isProposal(result)) return park(result, contextId);

      return completedTask(freshId(), contextId, skill, { data: result });
    } catch (error) {
      return failedTask(freshId(), contextId, error);
    }
  };

  const sendMessage = async (params: any, ctx: Ctx): Promise<Reply> => {
    const data = invocationOf(params?.message?.parts);

    if (!data) return { error: { code: -32005, message: NEEDS_DATA_PART } };
    const skill = typeof data.skill === 'string' ? data.skill : undefined;

    if (!skill) return { error: { code: -32602, message: 'Invalid parameters: the DataPart names no "skill"' } };
    const contextId = params.message.contextId ?? freshId();

    return { result: { task: await runSkill(skill, data.input, contextId, ctx) } };
  };

  const getTask = (params: any): Reply => {
    const id = String(params?.id ?? '');
    const record = tasks.get(id);

    if (!record) return { error: { code: -32001, message: `Task not found: ${id}` } };

    return { result: taskOf(id, record) };
  };

  const dispatch = (rpc: RpcRequest, ctx: Ctx): Reply | Promise<Reply> => {
    if (rpc.method === 'SendMessage') return sendMessage(rpc.params, ctx);
    if (rpc.method === 'GetTask') return getTask(rpc.params);
    if (UNSUPPORTED.has(rpc.method)) return { error: { code: -32004, message: `Unsupported operation: ${rpc.method}` } };

    return { error: { code: -32601, message: `Method not found: ${rpc.method}` } };
  };

  /**
   * Public by design (spec §8.2): discovery is what the card is for, and it can
   * only name what this caller may call anyway — the filter is the same one
   * `tools/list` uses, so an unauthenticated reader is told exactly as much as
   * an unauthenticated caller could spend.
   */
  const card = (req: Request, ctx: Ctx) =>
    agentCard({
      name: deps.serverName,
      description: deps.description,
      endpoint: new URL(A2A_PATH, deps.siteUrl ?? req.url).href,
      tools: callableTools(deps.tools, ctx),
      skills: deps.skills ?? [],
      auth: deps.auth !== undefined,
    });

  const handle = async (req: Request, ctx: Ctx): Promise<Response> => {
    // A browser (and a client that only knows the well-known path) gets the
    // card rather than a bare 405: it is the whole documentation of this URL.
    if (req.method === 'GET') return Response.json(card(req, ctx));
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    const refused = await refuseUnauthenticated(req, ctx, 'janux-a2a', deps.auth);

    if (refused) return refused;
    const body = (await req.json().catch(() => undefined)) as RpcRequest | undefined;

    if (!body) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });

    return Response.json({ jsonrpc: '2.0', id: body.id ?? null, ...(await dispatch(body, ctx)) });
  };

  return {
    handle,
    card: (req: Request, ctx: Ctx) => Response.json(card(req, ctx)),
    /** How the human's approval (or rejection) reaches the agent that is waiting for it. */
    settled: tasks.settle,
  };
}
