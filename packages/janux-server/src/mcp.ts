import { toJsonSchema, type Ctx, type GuardValue } from 'janux';
import { resolveApiGuard, type ApiTool } from './api';
import { mcpLandingPage } from './mcp-landing';
import type { Skill } from './skills';
import { decorateResult, discoverResult, modernGate } from './mcp-modern';

/**
 * Hosted MCP endpoint (RFC 0002 §13.2): `/_janux/mcp` speaks MCP over
 * streamable HTTP (JSON-RPC 2.0, stateless — a fresh logical server per
 * request, no session affinity). It advertises the app's `api()` functions as
 * tools and its pages as resources, generated from the app — zero drift.
 */

export interface McpAuth {
  /** Verifies a bearer token; null → 401 with WWW-Authenticate. */
  verify(token: string, req: Request): Promise<unknown | null> | unknown | null;
  /** Advertised in WWW-Authenticate resource metadata. */
  resourceMetadataUrl?: string;
}

export interface McpDeps {
  serverName: string;
  tools: ApiTool[];
  invoke(tool: string, input: unknown, ctx: Ctx): Promise<unknown>;
  listPages(): Promise<string[]>;
  readPage(path: string, ctx: Ctx): Promise<string | undefined>;
  /** The app's skills, projected as resources — see `skillResources`. */
  skills?: readonly Skill[];
  auth?: McpAuth;
}

interface RpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: any;
}

const PROTOCOL_VERSION = '2025-06-18';

function rpcResult(id: RpcRequest['id'], result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: RpcRequest['id'], code: number, message: string, data?: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function toolDescriptor(tool: ApiTool, guard: GuardValue) {
  return {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.input ? toJsonSchema(tool.input) : { type: 'object', properties: {} },
    annotations: guard === 'confirm' ? { requiresApproval: true } : undefined,
  };
}

/**
 * What this caller may be told exists — the same answer `apiManifestTools`
 * gives the app's own pages.
 *
 * Listing every tool and refusing the forbidden ones at call time is not a
 * gate: the name, the description and the input schema of a tool an agent may
 * never call were handed to it anyway, which is exactly what `forbidden`
 * exists to prevent. The guard is resolved once per listing, like
 * `apiManifestTools` and `toolsFor` do it, so a guard that answers differently
 * on each call cannot pass the filter and then be advertised as forbidden.
 */
function callableTools(tools: ApiTool[], ctx: Ctx): { tool: ApiTool; guard: GuardValue }[] {
  return tools
    .map((tool) => ({ tool, guard: resolveApiGuard(tool, ctx, 'agent') }))
    .filter(({ guard }) => guard !== 'forbidden');
}

function pageUri(path: string): string {
  return `janux://page${path}`;
}

const SKILL_URI = 'janux://skill/';

/**
 * Skills, as MCP already models them: the resource *list* is the index (name,
 * what it is, when to reach for it) and `resources/read` is the body. An
 * external client pays for the procedure only when it decides to follow it —
 * the same on-demand contract the built-in copilot gets from `load_skill`,
 * spoken in the protocol every other client already implements.
 */
function skillResources(skills: readonly Skill[]) {
  return skills.map((skill) => ({
    uri: `${SKILL_URI}${skill.name}`,
    name: skill.name,
    description: skill.when ? `${skill.description} Use when: ${skill.when}` : skill.description,
    mimeType: 'text/markdown',
  }));
}

/** One resource body, whichever scheme addressed it. Unknown URI ⇒ undefined ⇒ -32602. */
async function readResource(uri: string, deps: McpDeps, ctx: Ctx): Promise<string | undefined> {
  if (uri?.startsWith(SKILL_URI)) {
    return (deps.skills ?? []).find((skill) => skill.name === uri.slice(SKILL_URI.length))?.body;
  }
  if (!uri?.startsWith('janux://page')) return undefined;

  return deps.readPage(uri.slice('janux://page'.length) || '/', ctx);
}

async function handleMethod(rpc: RpcRequest, deps: McpDeps, ctx: Ctx): Promise<Record<string, unknown> | undefined> {
  const { id, method, params } = rpc;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: deps.serverName, version: '1' },
      });
    case 'notifications/initialized':
    case 'initialized':
      return undefined;
    case 'ping':
      return rpcResult(id, {});
    case 'server/discover':
      return rpcResult(id, discoverResult());
    case 'tools/list':
      return rpcResult(id, { tools: callableTools(deps.tools, ctx).map(({ tool, guard }) => toolDescriptor(tool, guard)) });
    case 'tools/call': {
      const name = params?.name as string;

      try {
        const result = await deps.invoke(name, params?.arguments ?? {}, ctx);

        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (error) {
        return rpcResult(id, { content: [{ type: 'text', text: String(error) }], isError: true });
      }
    }
    case 'resources/list': {
      const pages = await deps.listPages();

      return rpcResult(id, {
        resources: [
          ...pages.map((path) => ({ uri: pageUri(path), name: path, mimeType: 'text/markdown' })),
          ...skillResources(deps.skills ?? []),
        ],
      });
    }
    case 'resources/read': {
      const uri = params?.uri as string;
      const text = await readResource(uri, deps, ctx);

      if (text === undefined) return rpcError(id, -32602, `Unknown resource: ${uri}`);

      return rpcResult(id, { contents: [{ uri, mimeType: 'text/markdown', text }] });
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

function unauthorized(auth?: McpAuth): Response {
  const metadata = auth?.resourceMetadataUrl ? `, resource_metadata="${auth.resourceMetadataUrl}"` : '';

  return new Response(null, {
    status: 401,
    headers: { 'www-authenticate': `Bearer realm="janux-mcp"${metadata}` },
  });
}

export function createMcpEndpoint(deps: McpDeps) {
  return async function handleMcp(req: Request, ctx: Ctx): Promise<Response> {
    if (req.method === 'GET') {
      // Streamable HTTP allows GET for server-initiated streams; stateless
      // servers advertise none. A browser gets the instructions instead — see
      // mcp-landing.ts. MCP clients never ask for HTML, so they still get 405.
      if (!req.headers.get('accept')?.includes('text/html')) {
        return new Response(null, { status: 405, headers: { allow: 'POST' } });
      }

      // The same list `tools/list` would answer with: the landing is generated
      // from the app, and a page that names a tool the endpoint refuses to
      // advertise would be both a drift and an unauthenticated inventory of it.
      const listed = callableTools(deps.tools, ctx).map(({ tool }) => tool);

      return new Response(mcpLandingPage(deps.serverName, new URL(req.url).href, listed, deps.auth !== undefined), {
        headers: { 'content-type': 'text/html;charset=utf-8' },
      });
    }
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (deps.auth) {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const identity = token ? await deps.auth.verify(token, req) : null;

      if (!identity) return unauthorized(deps.auth);
      (ctx as any).mcpIdentity = identity;
    }
    const body = (await req.json().catch(() => undefined)) as RpcRequest | RpcRequest[] | undefined;

    if (!body) return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
    if (!Array.isArray(body)) {
      // Batches are a legacy-only construct; modern requests are one message per POST.
      const gate = modernGate(body, req.headers);

      if (gate) return Response.json(rpcError(body.id ?? null, gate.code, gate.message, gate.data), { status: 400 });
    }
    const batch = Array.isArray(body) ? body : [body];
    const respond = async (rpc: RpcRequest) => {
      const reply = await handleMethod(rpc, deps, ctx);

      if (!reply || !('result' in reply)) return reply;

      return {
        ...reply,
        result: decorateResult(rpc.method, reply.result as Record<string, unknown>, deps.serverName, deps.auth !== undefined),
      };
    };
    const replies = (await Promise.all(batch.map(respond))).filter(
      (reply): reply is Record<string, unknown> => reply !== undefined,
    );

    if (replies.length === 0) return new Response(null, { status: 202 });

    return Response.json(Array.isArray(body) ? replies : replies[0]);
  };
}
