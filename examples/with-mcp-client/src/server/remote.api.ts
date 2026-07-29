import { api } from '@janux/server';
import { schema, str } from 'janux';
import { allowed, connection, discover, parseArgs, remoteSettings, type RemoteSettings } from './mcp-connection';

/**
 * The `api()` pair that re-exposes the filtered remote MCP tools on this
 * app's own surface — manifest, hosted MCP and copilot alike. The outbound
 * connection and the allowlist live in `mcp-connection.ts`.
 */

const FIX =
  '# 1 — start an MCP server (any streamable-HTTP one will do)\n' +
  'bun run --cwd examples/with-mcp-url dev\n\n' +
  '# 2 — point this app at it\n' +
  'MCP_SERVER_URL=http://localhost:4321/_janux/mcp \\\n' +
  'MCP_SERVER_TOKEN=demo-agent-token bunx janux dev --port 4322';

/** What to do about it, in one line: a raw connection error is not an answer. */
function hintFor({ demo }: RemoteSettings): string {
  if (demo) return 'The built-in demo MCP server did not answer — restarting the app rebuilds it.';

  return (
    'Nothing answered there. Unset MCP_SERVER_URL to fall back to the built-in demo server, ' +
    'or start a real MCP server first:'
  );
}

export const listTools = api({
  description: 'Discover the tools of the connected remote MCP server, after the allowlist filter.',
  run: async () => {
    const settings = remoteSettings();
    const { url, demo } = settings;

    try {
      const tools = await discover(settings);

      return { available: true, url, demo, tools: tools.map(({ name, description }) => ({ name, description })) };
    } catch (error) {
      // Clean degradation: a dead remote is reported with a way out, never a crash.
      return { available: false, url, demo, tools: [], error: String(error), hint: hintFor(settings), fix: FIX };
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
