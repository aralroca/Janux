/**
 * Bearer protection for the hosted MCP endpoint, written as the standard
 * `src/middleware.ts` convention: it runs before routing and returning a
 * Response short-circuits the request.
 *
 * Only `POST /_janux/mcp` is gated — POST is the protocol (JSON-RPC 2.0),
 * while GET stays public so a browser still gets the landing page that
 * explains how to connect. The token comes from the `AGENT_TOKEN` env var,
 * with a demo default so the example runs out of the box.
 *
 * The 401 mirrors the framework's own `mcpAuth` answer (status + the
 * `WWW-Authenticate` challenge), so MCP clients see the same contract.
 */

const MCP_PATH = '/_janux/mcp';
const BEARER_PREFIX = /^Bearer\s+/i;
const DEMO_TOKEN = 'demo-agent-token';

function bearerToken(req: Request): string | undefined {
  const header = req.headers.get('authorization');

  return header ? header.replace(BEARER_PREFIX, '') : undefined;
}

function unauthorized(): Response {
  return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer realm="janux-mcp"' } });
}

export default function middleware(req: Request): Response | undefined {
  const { pathname } = new URL(req.url);

  if (pathname !== MCP_PATH || req.method !== 'POST') return undefined;
  if (bearerToken(req) === (process.env.AGENT_TOKEN ?? DEMO_TOKEN)) return undefined;

  return unauthorized();
}
