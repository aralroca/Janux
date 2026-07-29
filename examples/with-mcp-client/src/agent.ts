import { defineAgent } from '@janux/agent';
import { NAMESPACE, remoteSettings } from './server/mcp-connection';

/**
 * Two ways to reach the same remote MCP server, side by side:
 * - `mcp`: the framework discovers the remote tools (lazily, cached) and puts
 *   them straight into the model's tool list as `remote.*`;
 * - `api.remote.listTools`/`callTool`: the app's own re-exposure of that
 *   connection, for surfaces beyond the copilot (manifest, hosted MCP).
 * Settings are read once at mount; the api pair re-reads env per request.
 */
const remote = remoteSettings();

export default defineAgent({
  instructions:
    'You are the copilot of an app that consumes a remote MCP server. ' +
    'Tools prefixed "remote." are the remote server\'s own tools — call them directly. ' +
    'api.remote.listTools and api.remote.callTool re-expose the same connection. ' +
    'If no remote.* tools are available, the remote server is down — say so, never invent remote tools.',
  // The documented ToolFilter: an allowlist by prefix over this app's own surface.
  tools: { include: ['api.remote.*', 'remote-tools.*'] },
  mcp: {
    url: remote.url,
    headers: remote.token ? { authorization: `Bearer ${remote.token}` } : undefined,
    tools: { include: remote.include, exclude: remote.exclude },
    prefix: NAMESPACE,
  },
});
