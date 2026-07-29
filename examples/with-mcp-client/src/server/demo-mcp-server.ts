import { DEMO_TOOLS } from './demo-notes';

/**
 * The example's default remote: a real MCP server (JSON-RPC 2.0 over
 * streamable HTTP, ~40 lines) listening on a loopback port inside this same
 * process — so `bun run dev` demonstrates a full round trip with zero setup
 * and no second process to start. `MCP_SERVER_URL` replaces it with any other
 * server; nothing here is a mock, the outbound client speaks to it over HTTP
 * exactly as it would to a server on the other side of the internet.
 */

const SERVER_INFO = { name: 'janux-demo-notes', version: '1.0.0' };
const INITIALIZE = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: SERVER_INFO };

const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: '2.0', id, result });
const fail = (id: unknown, code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id, error: { code, message } });

function toolList() {
  return { tools: DEMO_TOOLS.map(({ name, description, input }) => ({ name, description, inputSchema: input })) };
}

function callTool(params: any) {
  const tool = DEMO_TOOLS.find((entry) => entry.name === params?.name);

  if (!tool) throw new Error(`unknown_tool: ${params?.name}`);
  const text = JSON.stringify(tool.run(params?.arguments ?? {}), null, 2);

  return { content: [{ type: 'text', text }] };
}

function route(rpc: any): unknown {
  if (rpc?.method === 'initialize') return INITIALIZE;
  if (rpc?.method === 'tools/list') return toolList();
  if (rpc?.method === 'tools/call') return callTool(rpc.params);

  throw new Error(`unknown_method: ${rpc?.method}`);
}

async function handle(request: Request): Promise<Response> {
  const rpc: any = await request.json().catch(() => null);

  try {
    return ok(rpc?.id ?? null, route(rpc));
  } catch (error) {
    const unknownMethod = String(error).includes('unknown_method');

    return fail(rpc?.id ?? null, unknownMethod ? -32601 : -32602, String(error));
  }
}

let server: ReturnType<typeof Bun.serve> | undefined;

function start() {
  const started = Bun.serve({ port: 0, fetch: handle });

  // Never the reason a process stays alive: the app's own server owns the loop.
  started.unref();

  return started;
}

/** Starts the demo server on first use and returns its endpoint. */
export function demoServerUrl(): string {
  server ??= start();

  return `http://localhost:${server.port}/mcp`;
}
