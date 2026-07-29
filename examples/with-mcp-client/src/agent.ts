import { defineAgent } from '@janux/agent';

export default defineAgent({
  instructions:
    'You are the copilot of an app that consumes a remote MCP server. ' +
    'Use api.remote.listTools to discover the remote tools that passed the allowlist filter, ' +
    'and api.remote.callTool (name + JSON-encoded args) to invoke one. ' +
    'If listTools reports the remote server unavailable, say so — never invent remote tools.',
  // The documented ToolFilter: an allowlist by prefix over this app's own surface.
  tools: { include: ['api.remote.*', 'remote-tools.*'] },
});
