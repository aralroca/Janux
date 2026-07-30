import { beforeAll, describe, expect } from 'bun:test';
import { signatureHeaders } from 'web-bot-auth';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { api, createJanuxServer } from '@janux/server';
import { jsx, schema, str } from 'janux';
import { runCases } from '../support/scenario';
import { CSRF_CASES, type CsrfRow } from './csrf.cases';

/**
 * Every row drives a real server through its real `fetch`, because the claim is
 * about the pipeline and not about a helper: a guard that the four routes do not
 * all pass through is exactly the bug.
 *
 * "Rejected" is asserted as *nothing happened* rather than as a status code —
 * `ran` is the app's own side effect — since a 403 that arrives after the refund
 * went through is not a defence.
 */
type Server = ReturnType<typeof createJanuxServer>;

interface Attempt {
  status: number;
  body: any;
  /** The route behind the guard actually executed. */
  ran: boolean;
}

let agentJwk: JsonWebKey;
let agentPrivate: JsonWebKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;

  agentJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  agentPrivate = await crypto.subtle.exportKey('jwk', pair.privateKey);
});

/** What the app under attack recorded — one entry per side effect that really happened. */
const done: string[] = [];

function makeServer(row: CsrfRow): Server {
  return createJanuxServer({
    routes: { '/': () => jsx('main', {}) },
    apis: {
      shop: {
        wire: api({ description: 'Wire money out', input: schema({ amount: str() }), run: () => done.push('wire') }),
        refund: api({ description: 'Refund. Irreversible.', guard: 'confirm', run: () => done.push('refund') }),
      },
    },
    agent: { handle: async () => new Response(String(done.push('agent-loop'))) },
    agents: { webBotAuth: { keys: [agentJwk] } },
    allowedOrigins: row.allowedOrigins,
  });
}

const readJson = (res: Response): Promise<any> => res.json().catch(() => undefined);

function unsigned(path: string, row: CsrfRow, body: unknown): Request {
  const init = row.method === 'GET' ? {} : { body: JSON.stringify(body) };

  return new Request(`http://test${path}`, {
    method: row.method,
    ...init,
    headers: { 'content-type': 'application/json', ...row.headers },
  });
}

/**
 * RFC 9421 covers the derived components (method, authority, path) and not the
 * posture headers, so they are re-attached around the signature the same way the
 * `agent-auth` suite does it.
 */
async function sign(req: Request, row: CsrfRow): Promise<Request> {
  const expires = Date.now() + 60_000;
  const created = new Date(expires - 60_000);
  const headers = await signatureHeaders(req, await signerFromJWK(agentPrivate), { created, expires: new Date(expires) });

  return new Request(req, {
    headers: { 'content-type': 'application/json', ...row.headers, Signature: headers.Signature, 'Signature-Input': headers['Signature-Input'] },
  });
}

async function send(server: Server, row: CsrfRow, path: string, body?: unknown): Promise<Response> {
  const req = unsigned(path, row, body);

  return server.fetch(row.signed ? await sign(req, row) : req);
}

/** A pending `confirm` proposal, created the honest way: the app's own page, acting for an agent. */
async function pendingProposal(server: Server): Promise<string> {
  const res = await server.fetch(
    new Request('http://test/_janux/api/shop.refund', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'x-janux-origin': 'agent', 'sec-fetch-site': 'same-origin', origin: 'http://test' },
    }),
  );

  return (await readJson(res)).result.id;
}

const approveAsPage = (server: Server, id: string): Promise<Response> =>
  server.fetch(
    new Request('http://test/_janux/approve', {
      method: 'POST',
      body: JSON.stringify({ id }),
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://test' },
    }),
  );

async function attemptApi(server: Server, row: CsrfRow): Promise<Attempt> {
  const res = await send(server, row, '/_janux/api/shop.wire', { amount: '100' });

  return { status: res.status, body: await readJson(res), ran: done.includes('wire') };
}

async function attemptApprove(server: Server, row: CsrfRow): Promise<Attempt> {
  const id = await pendingProposal(server);
  const res = await send(server, row, '/_janux/approve', { id });

  return { status: res.status, body: await readJson(res), ran: done.includes('refund') };
}

/** A refused reject must leave the proposal settleable — cancelling a human's pending decision is the forgery. */
async function attemptReject(server: Server, row: CsrfRow): Promise<Attempt> {
  const id = await pendingProposal(server);
  const res = await send(server, row, '/_janux/reject', { id });
  const body = await readJson(res);

  return { status: res.status, body, ran: (await approveAsPage(server, id)).status === 404 };
}

async function attemptAgent(server: Server, row: CsrfRow): Promise<Attempt> {
  const res = await send(server, row, '/_janux/agent', { messages: [] });

  return { status: res.status, body: await readJson(res), ran: done.includes('agent-loop') };
}

async function attemptMcp(server: Server, row: CsrfRow): Promise<Attempt> {
  const res = await send(server, row, '/_janux/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const body = await readJson(res);

  return { status: res.status, body, ran: body?.jsonrpc === '2.0' };
}

async function attemptManifest(server: Server, row: CsrfRow): Promise<Attempt> {
  const res = await send(server, row, '/_janux/manifest?path=/');
  const body = await readJson(res);

  return { status: res.status, body, ran: Array.isArray(body?.tools) };
}

const ATTEMPTS: Record<CsrfRow['endpoint'], (server: Server, row: CsrfRow) => Promise<Attempt>> = {
  api: attemptApi,
  approve: attemptApprove,
  reject: attemptReject,
  agent: attemptAgent,
  mcp: attemptMcp,
  manifest: attemptManifest,
};

describe('cross-site request forgery', () =>
  runCases(CSRF_CASES, async (row) => {
    done.length = 0;
    const attempt = await ATTEMPTS[row.endpoint](makeServer(row), row);

    if (row.allowed) {
      expect(attempt.status).not.toBe(403);
      expect(attempt.ran).toBe(true);

      return;
    }
    const refusal = row.refusal ?? { status: 403, error: 'cross_site_denied' };

    expect(attempt.body).toEqual({ ok: false, error: refusal.error });
    expect(attempt.status).toBe(refusal.status);
    expect(attempt.ran).toBe(false);
  }));
