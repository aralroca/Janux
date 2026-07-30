import { beforeAll, describe, expect, it } from 'bun:test';
import { signatureHeaders } from 'web-bot-auth';
import { signerFromJWK } from 'web-bot-auth/crypto';
import { jsx, schema, str, type AuditEntry } from 'janux';
import { api } from './api';
import { createJanuxServer, type ServerOptions } from './server';

let goodJwk: JsonWebKey;
let goodPrivate: JsonWebKey;
let strangerPrivate: JsonWebKey;

async function generateEd25519(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;

  return {
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

beforeAll(async () => {
  const good = await generateEd25519();
  const stranger = await generateEd25519();

  goodJwk = good.publicJwk;
  goodPrivate = good.privateJwk;
  strangerPrivate = stranger.privateJwk;
});

function makeServer(overrides: Partial<ServerOptions> = {}, audit?: AuditEntry[]) {
  return createJanuxServer({
    routes: { '/': () => jsx('main', {}) },
    apis: {
      shop: {
        echoAgent: api({
          description: 'Echo the verified agent',
          run: ({ ctx }) => ({ agent: ctx.agent ?? null }),
        }),
        pay: api({
          description: 'Charge. Irreversible.',
          input: schema({ total: str() }),
          guard: 'confirm',
          run: ({ input }) => ({ charged: input.total }),
        }),
        search: api({
          description: 'Search products',
          input: schema({ q: str() }),
          run: ({ input }) => [input.q],
        }),
      },
    },
    onAudit: audit ? (entry) => audit.push(entry) : undefined,
    ...overrides,
  });
}

async function signedRequest(path: string, body: unknown, privateJwk: JsonWebKey, expiresInMs = 60_000): Promise<Request> {
  const request = new Request(`http://test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-janux-origin': 'agent' },
  });
  const expires = Date.now() + expiresInMs;
  const headers = await signatureHeaders(request, await signerFromJWK(privateJwk), {
    created: new Date(expires - 60_000),
    expires: new Date(expires),
  });

  return new Request(request, {
    headers: {
      'content-type': 'application/json',
      'x-janux-origin': 'agent',
      Signature: headers['Signature'],
      'Signature-Input': headers['Signature-Input'],
    },
  });
}

const agentPost = (server: ReturnType<typeof createJanuxServer>, path: string, body: unknown) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      // An UNSIGNED agent call is the app's own copilot bridge: same-origin, and
      // identified by nothing. A signed one needs no such header — see sign().
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-janux-origin': 'agent' },
    }),
  );

describe('web bot auth', () => {
  it('observe policy serves unsigned agent calls with no identity', async () => {
    const server = makeServer({ agents: { webBotAuth: { keys: [] }, policy: 'observe' } });
    const body: any = await (await agentPost(server, '/_janux/api/shop.echoAgent', {})).json();

    expect(body).toEqual({ ok: true, result: { agent: null } });
  });

  it('require policy rejects unsigned agent calls with 401 and never gates humans', async () => {
    const server = makeServer({ agents: { webBotAuth: { keys: [] }, policy: 'require' } });
    const denied = await agentPost(server, '/_janux/api/shop.echoAgent', {});
    const human = await server.fetch(
      new Request('http://test/_janux/api/shop.echoAgent', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(denied.status).toBe(401);
    expect(((await denied.json()) as any).error).toBe('agent_required');
    expect(human.status).toBe(200);
  });

  it('require policy accepts a signed request and exposes ctx.agent', async () => {
    const server = makeServer({ agents: { webBotAuth: { keys: [goodJwk] }, policy: 'require' } });
    const res = await server.fetch(await signedRequest('/_janux/api/shop.echoAgent', {}, goodPrivate));
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.agent.verified).toBe(true);
    expect(typeof body.result.agent.keyId).toBe('string');
  });

  /**
   * Two layers refuse these, and the outer one answers first. A signature that
   * does not verify is not an agent, so what is left is a mutating call from
   * nowhere — forgery, refused with 403 before agent policy is consulted. The
   * 401 `agent_required` path is the one above: same-origin, `x-janux-origin:
   * agent`, no signature at all. Which is the point of the split — an unverified
   * signature buys exactly nothing, so a bad key cannot be used to skip the
   * CSRF guard (see conformance/security/csrf.cases.ts).
   */
  it('fails closed on unknown keys and expired signatures', async () => {
    const server = makeServer({ agents: { webBotAuth: { keys: [goodJwk] }, policy: 'require' } });
    const stranger = await server.fetch(await signedRequest('/_janux/api/shop.echoAgent', {}, strangerPrivate));
    const expired = await server.fetch(await signedRequest('/_janux/api/shop.echoAgent', {}, goodPrivate, -1000));

    expect(stranger.status).toBe(403);
    expect(expired.status).toBe(403);
  });
});

describe('api audit trail', () => {
  it('audits human and agent api calls, including failures', async () => {
    const entries: AuditEntry[] = [];
    const server = makeServer({}, entries);

    await server.fetch(
      new Request('http://test/_janux/api/shop.echoAgent', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );
    await agentPost(server, '/_janux/api/shop.search', { q: 42 });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ tool: 'api.shop.echoAgent', origin: 'human', ok: true });
    expect(entries[1]).toMatchObject({ tool: 'api.shop.search', origin: 'agent', ok: false });
  });

  it('audits the proposal → approve flow with the verified agent key', async () => {
    const entries: AuditEntry[] = [];
    const server = makeServer({ agents: { webBotAuth: { keys: [goodJwk] }, policy: 'require' } }, entries);
    const proposalRes = await server.fetch(await signedRequest('/_janux/api/shop.pay', { total: '10' }, goodPrivate));
    const proposal: any = ((await proposalRes.json()) as any).result;

    await server.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: proposal.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(entries[0]).toMatchObject({ tool: 'api.shop.pay', origin: 'agent', guard: 'confirm', ok: true });
    expect(typeof entries[0]?.agent).toBe('string');
    // The approved execution keeps the AGENT origin (a human only authorized
    // it) and stays attributed to the verified agent key — matching the
    // client-side approval path.
    expect(entries[1]).toMatchObject({ tool: 'api.shop.pay', origin: 'agent', ok: true });
    expect(typeof entries[1]?.agent).toBe('string');
  });
});
