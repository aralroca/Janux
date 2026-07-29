import { createMcpPool, type McpConnection, type RemoteTool } from '@janux/agent';

/**
 * The outbound MCP client of this app: one pooled `connectMcp` connection per
 * `MCP_SERVER_URL` (failures evict, so a remote restart self-heals), every
 * remote tool namespaced as `remote.*`, and an env-driven allowlist filter
 * with the same semantics as `defineAgent({ tools })`.
 */

export const NAMESPACE = 'remote';

const DEFAULT_URL = 'http://localhost:4322/_janux/mcp';
const pool = createMcpPool();

export interface RemoteSettings {
  url: string;
  token?: string;
  include: string[];
  exclude: string[];
}

function patterns(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Env is read per request so the same process can retarget servers (tests, ops). */
export function remoteSettings(): RemoteSettings {
  const include = patterns(process.env.MCP_TOOL_INCLUDE);

  return {
    url: process.env.MCP_SERVER_URL ?? DEFAULT_URL,
    token: process.env.MCP_SERVER_TOKEN || undefined,
    include: include.length ? include : [`${NAMESPACE}.*`],
    exclude: patterns(process.env.MCP_TOOL_EXCLUDE),
  };
}

/*
 * Mirror of the `defineAgent({ tools })` ToolFilter semantics: `'remote.docs.*'`
 * matches by prefix, anything else exactly, and `exclude` always wins.
 * Duplicated here because `@janux/agent` does not export `allowsTool`.
 */
function matches(name: string, pattern: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

export function allowed(name: string, { include, exclude }: RemoteSettings): boolean {
  const included = !include.length || include.some((pattern) => matches(name, pattern));

  return included && !exclude.some((pattern) => matches(name, pattern));
}

export function connection({ url, token }: RemoteSettings): McpConnection {
  return pool.get(url, { url, token, namespace: NAMESPACE });
}

export async function discover(settings: RemoteSettings): Promise<RemoteTool[]> {
  const tools = await connection(settings).tools();

  return tools.filter((tool) => allowed(tool.name, settings));
}

export function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`invalid_args_json: ${raw}`);
  }
}
