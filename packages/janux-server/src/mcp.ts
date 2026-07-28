import type { Ctx } from 'janux';
import type { ApiTool } from './api';
import { mcpLandingPage } from './mcp-landing';
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

function toolDescriptor(tool: ApiTool) {
  return {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.input ?? { type: 'object', properties: {} },
    annotations: tool.guard === 'confirm' ? { requiresApproval: true } : undefined,
  };
}

function pageUri(path: string): string {
  return `janux://page${path}`;
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
      return rpcResult(id, { tools: deps.tools.map(toolDescriptor) });
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
        resources: pages.map((path) => ({ uri: pageUri(path), name: path, mimeType: 'text/markdown' })),
      });
    }
    case 'resources/read': {
      const uri = params?.uri as string;
      const path = uri?.startsWith('janux://page') ? uri.slice('janux://page'.length) || '/' : undefined;
      const text = path ? await deps.readPage(path, ctx) : undefined;

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

      return new Response(mcpLandingPage(deps.serverName, new URL(req.url).href, deps.tools), {
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
