import { allowsTool, createMcpPool, type McpConnection, type RemoteTool } from '@janux/agent';
import { demoServerUrl } from './demo-mcp-server';

/**
 * The outbound MCP client of this app: one pooled `connectMcp` connection per
 * `MCP_SERVER_URL` (failures evict, so a remote restart self-heals), every
 * remote tool namespaced as `remote.*`, and an env-driven allowlist filter
 * with the same semantics as `defineAgent({ tools })`.
 *
 * With no env at all the target is the demo MCP server this process starts
 * itself, so the example works the moment it boots; `MCP_SERVER_URL` points it
 * at a real server instead.
 */

export const NAMESPACE = 'remote';

const pool = createMcpPool();

export interface RemoteSettings {
  url: string;
  /** True while the target is the built-in demo server (no `MCP_SERVER_URL`). */
  demo: boolean;
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

function toolFilter(): Pick<RemoteSettings, 'include' | 'exclude'> {
  const include = patterns(process.env.MCP_TOOL_INCLUDE);

  return { include: include.length ? include : [`${NAMESPACE}.*`], exclude: patterns(process.env.MCP_TOOL_EXCLUDE) };
}

/** Env is read per request so the same process can retarget servers (tests, ops). */
export function remoteSettings(): RemoteSettings {
  const configured = process.env.MCP_SERVER_URL?.trim();

  return {
    url: configured || demoServerUrl(),
    demo: !configured,
    token: process.env.MCP_SERVER_TOKEN || undefined,
    ...toolFilter(),
  };
}

/** The framework's own `ToolFilter` semantics — `defineAgent({ tools })` and this allowlist agree. */
export function allowed(name: string, { include, exclude }: RemoteSettings): boolean {
  return allowsTool(name, { include, exclude });
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
