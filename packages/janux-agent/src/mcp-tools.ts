import type { FetchLike } from './providers';
import { connectMcp, type McpClientOptions, type McpConnection, type RemoteTool } from './harness/mcp-client';
import { allowsTool, type ToolFilter } from './tool-filter';

/**
 * `defineAgent({ mcp })`: tools of remote MCP servers joining the agent's own
 * tool list. Discovery is lazy (first turn) and cached for the mount's
 * lifetime; a failed discovery is retried on the next turn and never downs the
 * agent — that turn simply runs without the remote tools.
 */

export interface McpAgentConnection {
  /** The remote server's JSON-RPC endpoint. */
  url: string;
  /** Extra headers on every request, e.g. `{ authorization: 'Bearer …' }`. */
  headers?: Record<string, string>;
  /** Which remote tools reach the model, matched on the prefixed name. */
  tools?: ToolFilter;
  /** Namespace for the remote tool names (default: 'mcp'). */
  prefix?: string;
}

export interface RemoteToolbox {
  /** The filtered remote tools, discovered on first use and cached. */
  tools(): Promise<RemoteTool[]>;
  /** Whether `name` belongs to a discovered remote tool. */
  owns(name: string): boolean;
  call(name: string, input: unknown): Promise<unknown>;
}

interface Bridge {
  connection: McpConnection;
  filter: ToolFilter | undefined;
}

type McpFetch = NonNullable<McpClientOptions['fetchImpl']>;

function withHeaders(fetchImpl: FetchLike, headers: Record<string, string> | undefined): McpFetch {
  if (!headers) return (url, init = {}) => fetchImpl(url, init);

  return (url, init = {}) =>
    fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...headers } });
}

function toBridge(config: McpAgentConnection, fetchImpl: FetchLike): Bridge {
  const connection = connectMcp({
    url: config.url,
    namespace: config.prefix ?? 'mcp',
    fetchImpl: withHeaders(fetchImpl, config.headers),
  });

  return { connection, filter: config.tools };
}

async function discover(bridges: Bridge[]): Promise<RemoteTool[]> {
  const lists = await Promise.all(
    bridges.map(async ({ connection, filter }) => {
      const tools = await connection.tools();

      return tools.filter((tool) => allowsTool(tool.name, filter));
    }),
  );

  return lists.flat();
}

export function createRemoteToolbox(
  mcp: McpAgentConnection | McpAgentConnection[] | undefined,
  fetchImpl: FetchLike,
): RemoteToolbox | undefined {
  const bridges = [mcp ?? []].flat().map((config) => toBridge(config, fetchImpl));

  if (!bridges.length) return undefined;
  const known = new Map<string, RemoteTool>();
  let cached: Promise<RemoteTool[]> | undefined;
  const load = () =>
    discover(bridges).then((tools) => {
      tools.forEach((tool) => known.set(tool.name, tool));

      return tools;
    });

  return {
    tools() {
      // A rejected discovery empties THIS turn's tool list and uncaches itself,
      // so the next turn re-probes — a remote restart is self-healing.
      cached ??= load().catch(() => {
        cached = undefined;

        return [];
      });

      return cached;
    },
    owns: (name) => known.has(name),
    call(name, input) {
      const tool = known.get(name);

      if (!tool) return Promise.reject(new Error(`unknown_remote_tool:${name}`));

      return tool.call(input);
    },
  };
}
