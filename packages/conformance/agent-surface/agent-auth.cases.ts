import { api, createAgentAuth, createJanuxServer } from '@janux/server';
import { jsx, type AuditEntry } from 'janux';
import { signatureHeaders } from 'web-bot-auth';
import { signerFromJWK } from 'web-bot-auth/crypto';
import type { ScenarioCase } from '../support/scenario';

/**
 * Web Bot Auth (RFC 9421): which agent is calling, and whether the app believes it.
 *
 * The identity is only worth anything if it fails closed, so the rows that
 * matter are the refusals — an unknown key, an expired window, a signature
 * copied onto another request — and the fact that a *failed* verification is
 * `verified: false` rather than "no agent here", which would be
 * indistinguishable from an honest anonymous caller.
 */

type Server = ReturnType<typeof createJanuxServer>;

const h = (tag: string, children: unknown) => jsx(tag, { children });
const ORIGIN = 'http://signed.test';
const SAME_SITE = { 'sec-fetch-site': 'same-origin', origin: ORIGIN, 'content-type': 'application/json' };

interface Pair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

let keys: Promise<{ agent: Pair; stranger: Pair }> | undefined;

async function pair(): Promise<Pair> {
  const generated = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;

  return {
    publicJwk: await crypto.subtle.exportKey('jwk', generated.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', generated.privateKey),
  };
}

/** One allowlisted key plus one the app has never heard of, minted once for the suite. */
const both = (): Promise<{ agent: Pair; stranger: Pair }> =>
  (keys ??= Promise.all([pair(), pair()]).then(([agent, stranger]) => ({ agent, stranger })));

async function signed(req: Request, privateJwk: JsonWebKey, window = 60_000): Promise<Request> {
  const expires = Date.now() + window;
  const headers = await signatureHeaders(req, await signerFromJWK(privateJwk), {
    created: new Date(expires - 60_000),
    expires: new Date(expires),
  });

  return new Request(req, {
    headers: { ...SAME_SITE, 'x-janux-origin': 'agent', Signature: headers.Signature, 'Signature-Input': headers['Signature-Input'] },
  });
}

const call = (path = '/_janux/api/shop.read', body = '{}') =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', body, headers: { ...SAME_SITE, 'x-janux-origin': 'agent' } });

const audits: AuditEntry[] = [];

function app(policy?: 'observe' | 'require', publicJwk?: JsonWebKey): Server {
  return createJanuxServer({
    title: 'Signed',
    routes: { '/': () => h('main', 'home') },
    apis: { shop: { read: api({ description: 'Read', run: () => 'read' }) } },
    agents: { webBotAuth: { keys: publicJwk ? [publicJwk] : [] }, policy },
    onAudit: (entry) => audits.push(entry),
  });
}

/** `verified/keyId` as the app's own auth helper reports it for a request. */
async function identify(request: Request, allowlisted: JsonWebKey[]): Promise<string> {
  const auth = createAgentAuth({ webBotAuth: { keys: allowlisted } });
  const identity = await auth.identify(request);

  return identity === null ? 'anonymous' : `verified=${identity.verified}${identity.keyId ? ' keyed' : ''}`;
}

export const AGENT_AUTH_CASES: ScenarioCase[] = [
  // ── who is calling ──────────────────────────────────────────────────────────
  {
    id: 'agent2-auth-an-unsigned-request-carries-no-identity-at-all',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(await identify(call(), [agent.publicJwk]));
    },
    expected: ['anonymous'],
  },
  {
    id: 'agent2-auth-a-request-signed-by-an-allowlisted-key-is-verified',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(await identify(await signed(call(), agent.privateJwk), [agent.publicJwk]));
    },
    expected: ['verified=true keyed'],
  },
  {
    id: 'agent2-auth-a-signature-from-an-unknown-key-is-refused-not-ignored',
    src: 'janux',
    run: async (log) => {
      const { agent, stranger } = await both();

      log.push(await identify(await signed(call(), stranger.privateJwk), [agent.publicJwk]));
    },
    expected: ['verified=false'],
  },
  {
    id: 'agent2-auth-an-expired-signature-is-refused',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(await identify(await signed(call(), agent.privateJwk, -1_000), [agent.publicJwk]));
    },
    expected: ['verified=false'],
  },
  {
    id: 'agent2-auth-a-garbage-signature-header-is-refused-rather-than-thrown',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const request = new Request(`${ORIGIN}/_janux/api/shop.read`, {
        method: 'POST',
        body: '{}',
        headers: { ...SAME_SITE, Signature: 'not-a-signature', 'Signature-Input': 'nonsense' },
      });

      log.push(await identify(request, [agent.publicJwk]));
    },
    expected: ['verified=false'],
  },
  {
    id: 'agent2-auth-the-signature-covers-the-host-and-the-expiry-window',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const request = await signed(call(), agent.privateJwk);
      const input = request.headers.get('signature-input')!;

      log.push(`${input.slice(input.indexOf('('), input.indexOf(')') + 1)} tag=${input.includes('tag="web-bot-auth"')}`);
    },
    expected: ['("@authority") tag=true'],
  },
  {
    id: 'agent2-auth-an-identity-is-bound-to-the-host-not-to-one-endpoint',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const original = await signed(call('/_janux/api/shop.read'), agent.privateJwk);
      // Web Bot Auth answers "which bot", not "which call" — the same signature
      // identifies the same agent anywhere on the host until it expires, which
      // is why `ctx.agent` is an identity and the guard is the authorization.
      const elsewhere = new Request(`${ORIGIN}/_janux/api/shop.other`, { method: 'POST', body: '{}', headers: original.headers });

      log.push(await identify(elsewhere, [agent.publicJwk]));
    },
    expected: ['verified=true keyed'],
  },
  {
    id: 'agent2-auth-a-signature-minted-for-another-host-does-not-verify',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const foreign = new Request('http://elsewhere.test/_janux/api/shop.read', { method: 'POST', body: '{}' });
      const original = await signed(foreign, agent.privateJwk);
      const replayed = new Request(`${ORIGIN}/_janux/api/shop.read`, { method: 'POST', body: '{}', headers: original.headers });

      log.push(await identify(replayed, [agent.publicJwk]));
    },
    expected: ['verified=false'],
  },
  {
    id: 'agent2-auth-an-app-with-an-empty-allowlist-verifies-nobody',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(await identify(await signed(call(), agent.privateJwk), []));
    },
    expected: ['verified=false'],
  },
  {
    id: 'agent2-auth-the-key-id-is-derived-from-the-key-not-supplied-by-the-caller',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const auth = createAgentAuth({ webBotAuth: { keys: [agent.publicJwk] } });
      const first = await auth.identify(await signed(call(), agent.privateJwk));
      const second = await auth.identify(await signed(call('/_janux/api/shop.read', '{"q":1}'), agent.privateJwk));

      log.push(`same=${first!.keyId === second!.keyId}`, `length=${first!.keyId!.length > 20}`);
    },
    expected: ['same=true', 'length=true'],
  },
  {
    id: 'agent2-auth-the-keyring-is-loaded-once-and-reused-across-requests',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const auth = createAgentAuth({ webBotAuth: { keys: [agent.publicJwk] } });
      const results = await Promise.all([
        auth.identify(await signed(call(), agent.privateJwk)),
        auth.identify(await signed(call(), agent.privateJwk)),
      ]);

      log.push(results.map((identity) => identity!.verified).join(','));
    },
    expected: ['true,true'],
  },
  {
    id: 'agent2-auth-observing-is-the-default-posture',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(createAgentAuth({ webBotAuth: { keys: [agent.publicJwk] } }).policy);
    },
    expected: ['observe'],
  },
  {
    id: 'agent2-auth-a-declared-posture-is-the-one-that-applies',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      log.push(createAgentAuth({ webBotAuth: { keys: [agent.publicJwk] }, policy: 'require' }).policy);
    },
    expected: ['require'],
  },

  // ── what the posture does to a call ─────────────────────────────────────────
  {
    id: 'agent2-auth-observing-serves-an-unsigned-agent-call',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const res = await app('observe', agent.publicJwk).fetch(call());

      log.push(`${res.status} ${JSON.stringify(await res.json())}`);
    },
    expected: ['200 {"ok":true,"result":"read"}'],
  },
  {
    id: 'agent2-auth-requiring-refuses-an-unsigned-agent-call',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const res = await app('require', agent.publicJwk).fetch(call());

      log.push(`${res.status} ${JSON.stringify(await res.json())}`);
    },
    expected: ['401 {"ok":false,"error":"agent_required"}'],
  },
  {
    id: 'agent2-auth-requiring-serves-a-properly-signed-agent-call',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const res = await app('require', agent.publicJwk).fetch(await signed(call(), agent.privateJwk));

      log.push(`${res.status}`);
    },
    expected: ['200'],
  },
  {
    id: 'agent2-auth-requiring-refuses-a-call-signed-by-a-stranger',
    src: 'janux',
    run: async (log) => {
      const { agent, stranger } = await both();
      const res = await app('require', agent.publicJwk).fetch(await signed(call(), stranger.privateJwk));

      log.push(`${res.status}`);
    },
    expected: ['401'],
  },
  {
    id: 'agent2-auth-requiring-never-gates-a-human-on-the-apps-own-page',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();
      const request = new Request(`${ORIGIN}/_janux/api/shop.read`, { method: 'POST', body: '{}', headers: SAME_SITE });
      const res = await app('require', agent.publicJwk).fetch(request);

      log.push(`${res.status}`);
    },
    expected: ['200'],
  },
  {
    id: 'agent2-auth-a-verified-key-reaches-the-audit-trail',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      audits.length = 0;
      await app('require', agent.publicJwk).fetch(await signed(call(), agent.privateJwk));
      log.push(`${audits[0]!.tool} ${audits[0]!.origin} keyed=${Boolean(audits[0]!.agent)}`);
    },
    expected: ['api.shop.read agent keyed=true'],
  },
  {
    id: 'agent2-auth-an-unsigned-agent-call-is-audited-without-a-key',
    src: 'janux',
    run: async (log) => {
      const { agent } = await both();

      audits.length = 0;
      await app('observe', agent.publicJwk).fetch(call());
      log.push(`${audits[0]!.origin} key=${String(audits[0]!.agent)}`);
    },
    expected: ['agent key=undefined'],
  },
];
