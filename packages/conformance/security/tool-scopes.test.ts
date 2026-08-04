import { describe, expect } from 'bun:test';
import { api, createJanuxServer, createSessionStore } from '@janux/server';
import { jsx } from 'janux';
import { signatureHeaders } from 'web-bot-auth';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { runCases } from '../support/scenario';
import { TOOL_SCOPE_CASES, type ToolScopeRow } from './tool-scopes.cases';

/**
 * The server-side doors: the page manifest, the hosted MCP listing and the
 * HTTP invocation endpoint. The in-page bridge is the same corpus, run in
 * `tool-scopes-bridge.test.ts` — Happy-DOM registration is per file, and
 * handing `document` to these rows would flip the framework's own
 * server/client branches underneath them.
 *
 * The grant reaches `ctx` the way an app's would: a signed session cookie for
 * the user, a Web Bot Auth signature for the agent. Nothing here reaches into
 * the framework — a row is an app the framework has to hold to its own rules.
 */

type Server = ReturnType<typeof createJanuxServer>;

const ORIGIN = 'http://scoped.test';
const SECRET = 'conformance-only';
const sessions = createSessionStore<{ scopes: string[] }>({ secret: SECRET });

interface Pair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

let agentKey: Promise<Pair> | undefined;

/** One agent key for the suite: the grant is the app's answer about it, not a second key. */
function key(): Promise<Pair> {
  return (agentKey ??= (crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as Promise<CryptoKeyPair>).then(
    async (generated) => ({
      publicJwk: await crypto.subtle.exportKey('jwk', generated.publicKey),
      privateJwk: await crypto.subtle.exportKey('jwk', generated.privateKey),
    }),
  ));
}

function appFor(row: ToolScopeRow, publicJwk: JsonWebKey): Server {
  return createJanuxServer({
    session: sessions,
    agents: { webBotAuth: { keys: [publicJwk] } },
    routes: { '/': () => jsx('main', { children: 'orders' }) },
    // The app's own authorization: the session carries the grant, the verified
    // agent carries how much of it this caller may spend.
    ctxFor: (_req, { session, agent }) => ({
      scopes: (session as { scopes: string[] } | undefined)?.scopes,
      agent: agent?.verified ? { scopes: row.agent } : undefined,
    }),
    apis: {
      orders: {
        list: api({ description: 'List orders', scopes: ['orders:read'], run: () => 'LISTED' }),
        refund: api({ description: 'Refund an order', scopes: ['orders:write'], run: () => 'REFUNDED' }),
        status: api({ description: 'Service status', run: () => 'STATUS' }),
      },
    },
  });
}

/** Signed only when the row has an agent — the rest act as the session alone. */
async function sign(req: Request, row: ToolScopeRow): Promise<Request> {
  if (!row.agent) return req;
  const expires = new Date(Date.now() + 60_000);
  const headers = await signatureHeaders(req, await signerFromJWK((await key()).privateJwk), {
    created: new Date(),
    expires,
  });
  const merged = new Headers(req.headers);

  merged.set('Signature', headers.Signature);
  merged.set('Signature-Input', headers['Signature-Input']);

  return new Request(req, { headers: merged });
}

function headersFor(row: ToolScopeRow, asAgent: boolean): Record<string, string> {
  return {
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    origin: ORIGIN,
    cookie: sessions.issue({ scopes: row.session }).split(';')[0]!,
    ...(asAgent ? { 'x-janux-origin': 'agent' } : {}),
  };
}

const toolNames = (tools: { name: string }[]): string => `tools:${tools.map((tool) => tool.name).sort().join(',')}`;

async function readManifest(server: Server, row: ToolScopeRow): Promise<string[]> {
  const request = new Request(`${ORIGIN}/_janux/manifest?path=/`, { headers: headersFor(row, true) });
  const body: any = await (await server.fetch(await sign(request, row))).json();

  return [toolNames(body.tools)];
}

async function readMcpListing(server: Server, row: ToolScopeRow): Promise<string[]> {
  const request = new Request(`${ORIGIN}/_janux/mcp`, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    headers: headersFor(row, true),
  });
  const body: any = await (await server.fetch(await sign(request, row))).json();

  return [toolNames(body.result.tools)];
}

/** One call, logged as the caller experiences it: the status, then the result or the refusal. */
async function callApi(server: Server, row: ToolScopeRow, tool: string, asAgent: boolean): Promise<string> {
  const request = new Request(`${ORIGIN}/_janux/api/orders.${tool}`, {
    method: 'POST',
    body: '{}',
    headers: headersFor(row, asAgent),
  });
  const response = await server.fetch(await sign(request, row));
  const body: any = await response.json();

  return `${tool}/${asAgent ? 'agent' : 'human'}:${response.status} ${body.ok ? body.result : body.error}`;
}

const CALLS: [tool: string, asAgent: boolean][] = [
  ['refund', true],
  ['refund', false],
  ['list', true],
  ['status', true],
];

async function runRow(row: ToolScopeRow): Promise<string[]> {
  const server = appFor(row, (await key()).publicJwk);

  if (row.via === 'manifest') return readManifest(server, row);
  if (row.via === 'mcp') return readMcpListing(server, row);

  return Promise.all(CALLS.map(([tool, asAgent]) => callApi(server, row, tool, asAgent)));
}

describe('per-agent scopes: manifest, MCP and HTTP', () =>
  runCases(
    TOOL_SCOPE_CASES.filter((row) => row.via !== 'bridge'),
    async (row) => expect(await runRow(row)).toEqual(row.expected),
  ));
