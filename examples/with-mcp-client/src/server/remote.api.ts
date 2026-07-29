import { api } from '@janux/server';
import { schema, str } from 'janux';
import { allowed, connection, discover, parseArgs, remoteSettings } from './mcp-connection';

/**
 * The `api()` pair that re-exposes the filtered remote MCP tools on this
 * app's own surface — manifest, hosted MCP and copilot alike. The outbound
 * connection and the allowlist live in `mcp-connection.ts`.
 */

export const listTools = api({
  description: 'Discover the tools of the connected remote MCP server, after the allowlist filter.',
  run: async () => {
    const settings = remoteSettings();

    try {
      const tools = await discover(settings);

      return {
        available: true,
        url: settings.url,
        tools: tools.map(({ name, description }) => ({ name, description })),
      };
    } catch (error) {
      // Clean degradation: a dead remote is reported, never a crash.
      return { available: false, url: settings.url, tools: [], error: String(error) };
    }
  },
});

export const callTool = api({
  description: 'Invoke one remote MCP tool by its namespaced name (remote.*), with JSON-encoded arguments.',
  input: schema({ name: str().min(1), args: str().default('{}') }),
  run: async ({ input }) => {
    const settings = remoteSettings();

    if (!allowed(input.name, settings)) throw new Error(`tool_not_allowed: ${input.name}`);

    return connection(settings).call(input.name, parseArgs(input.args));
  },
});
