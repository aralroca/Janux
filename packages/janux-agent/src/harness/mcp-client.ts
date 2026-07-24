import type { AgentTool } from '../providers';

/**
 * Outbound MCP client (RFC 0002 §24): connects the agent to remote MCP servers
 * over streamable HTTP. Per-token clients are cached by a caller-supplied key
 * and evicted when the connection goes dead — the didit-assistant pattern for
 * acting as the signed-in user against a hosted MCP.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface McpClientOptions {
  url: string;
  /** Bearer token forwarded as the user (omit for public servers). */
  token?: string;
  fetchImpl?: FetchLike;
  /** Prefix remote tool names to avoid collisions (e.g. 'didit'). */
  namespace?: string;
}

export interface RemoteTool extends AgentTool {
  call(input: unknown): Promise<unknown>;
}

let rpcSeq = 0;

async function rpc(options: McpClientOptions, method: string, params?: unknown): Promise<any> {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const response = await doFetch(options.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: (rpcSeq += 1), method, params }),
  });

  if (!response.ok) throw new Error(`mcp_http_${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('text/event-stream')
    ? parseSseJson(await response.text())
    : await response.json();

  if (payload?.error) throw new Error(`mcp_error_${payload.error.code}: ${payload.error.message}`);

  return payload?.result;
}

/** Streamable-HTTP servers may answer a single JSON-RPC response as one SSE event. */
function parseSseJson(text: string): any {
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');

  return data ? JSON.parse(data) : undefined;
}

export interface McpConnection {
  tools(): Promise<RemoteTool[]>;
  call(name: string, input: unknown): Promise<unknown>;
}

export function connectMcp(options: McpClientOptions): McpConnection {
  let initialized: Promise<void> | undefined;
  const ensureInit = () => {
    initialized ??= rpc(options, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'janux-agent', version: '1' },
    }).then(() => undefined);

    return initialized;
  };
  const prefixed = (name: string) => (options.namespace ? `${options.namespace}.${name}` : name);
  const bare = (name: string) => (options.namespace ? name.slice(options.namespace.length + 1) : name);

  return {
    async tools() {
      await ensureInit();
      const result = await rpc(options, 'tools/list');

      return (result?.tools ?? []).map((tool: any) => ({
        name: prefixed(tool.name),
        description: tool.description ?? '',
        input: tool.inputSchema,
        call: (input: unknown) => this.call(prefixed(tool.name), input),
      }));
    },
    async call(name: string, input: unknown) {
      await ensureInit();

      return rpc(options, 'tools/call', { name: bare(name), arguments: input ?? {} });
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
