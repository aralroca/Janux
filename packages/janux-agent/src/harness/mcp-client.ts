import type { AgentTool } from '../providers';
import { CLIENT_INFO, encodeHeaderValue, isLegacySignal, rpc } from './mcp-wire';

/**
 * Outbound MCP client (RFC 0002 §24): connects the agent to remote MCP servers
 * over streamable HTTP. Dual-era (spec 2026-07-28): requests go out with modern
 * per-request `_meta` and mirrored headers; a 400 whose body is not a modern
 * error marks the server legacy and the client falls back to the `initialize`
 * handshake, caching the era for the connection's lifetime. Per-token clients
 * are cached by a caller-supplied key and evicted when the connection goes
 * dead — the didit-assistant pattern for acting as the signed-in user against
 * a hosted MCP.
 */

export interface McpClientOptions {
  url: string;
  /** Bearer token forwarded as the user (omit for public servers). */
  token?: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Prefix remote tool names to avoid collisions (e.g. 'didit'). */
  namespace?: string;
}

export interface RemoteTool extends AgentTool {
  call(input: unknown): Promise<unknown>;
}

export interface McpConnection {
  tools(): Promise<RemoteTool[]>;
  call(name: string, input: unknown): Promise<unknown>;
}

interface HeaderParam {
  param: string;
  header: string;
}

/** `x-mcp-header` annotations in a tool's inputSchema, to mirror on tools/call. */
function headerAnnotations(inputSchema: any): HeaderParam[] {
  return Object.entries(inputSchema?.properties ?? {})
    .filter(([, prop]) => (prop as any)?.['x-mcp-header'])
    .map(([param, prop]) => ({ param, header: (prop as any)['x-mcp-header'] }));
}

function paramHeaders(annotations: HeaderParam[] | undefined, input: unknown): Record<string, string> | undefined {
  if (!annotations?.length) return undefined;

  return Object.fromEntries(
    annotations
      .filter(({ param }) => (input as Record<string, unknown>)?.[param] !== undefined)
      .map(({ param, header }) => [
        `mcp-param-${header.toLowerCase()}`,
        encodeHeaderValue((input as Record<string, unknown>)[param]),
      ]),
  );
}

export function connectMcp(options: McpClientOptions): McpConnection {
  let era: 'modern' | 'legacy' | undefined;
  let initialized: Promise<void> | undefined;
  const mirrored = new Map<string, HeaderParam[]>();

  const ensureInit = () => {
    initialized ??= rpc(
      options,
      'initialize',
      { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: CLIENT_INFO },
      { modern: false },
    ).then(() => undefined);

    return initialized;
  };
  const request = async (method: string, params?: unknown, headers?: Record<string, string>) => {
    if (era !== 'legacy') {
      try {
        const result = await rpc(options, method, params, { modern: true, paramHeaders: headers });

        era = 'modern';

        return result;
      } catch (error) {
        if (era === 'modern' || !isLegacySignal(error)) throw error;
        era = 'legacy';
      }
    }
    await ensureInit();

    return rpc(options, method, params, { modern: false });
  };
  const prefixed = (name: string) => (options.namespace ? `${options.namespace}.${name}` : name);
  const bare = (name: string) => (options.namespace ? name.slice(options.namespace.length + 1) : name);

  return {
    async tools() {
      const result = await request('tools/list');

      return (result?.tools ?? []).map((tool: any) => {
        mirrored.set(tool.name, headerAnnotations(tool.inputSchema));

        return {
          name: prefixed(tool.name),
          description: tool.description ?? '',
          input: tool.inputSchema,
          call: (input: unknown) => this.call(prefixed(tool.name), input),
        };
      });
    },
    async call(name: string, input: unknown) {
      const wireName = bare(name);

      return request('tools/call', { name: wireName, arguments: input ?? {} }, paramHeaders(mirrored.get(wireName), input));
    },
  };
}

/** Per-key connection cache with evict-on-dead (per-user hosted MCP pattern). */
export function createMcpPool() {
  const pool = new Map<string, McpConnection>();

  return {
    get(key: string, options: McpClientOptions): McpConnection {
      const existing = pool.get(key);

      if (existing) return existing;
      const raw = connectMcp(options);
      const evicting: McpConnection = {
        tools: () =>
          raw.tools().catch((error) => {
            pool.delete(key);
            throw error;
          }),
        call: (name, input) =>
          raw.call(name, input).catch((error) => {
            if (String(error).startsWith('Error: mcp_http_')) pool.delete(key);
            throw error;
          }),
      };

      pool.set(key, evicting);

      return evicting;
    },
    evict: (key: string) => pool.delete(key),
    size: () => pool.size,
  };
}
