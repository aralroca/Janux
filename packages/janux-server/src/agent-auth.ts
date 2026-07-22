import { helpers, jwkToKeyID, verify } from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';

export interface AgentIdentity {
  verified: boolean;
  keyId?: string;
}

export interface AgentsConfig {
  webBotAuth: { keys: JsonWebKey[] };
  policy?: 'observe' | 'require';
}

type KeyVerifier = (data: string, signature: Uint8Array, params: VerifyParams) => Promise<void>;

interface VerifyParams {
  keyid: string;
  expires: Date;
}

async function keyEntry(jwk: JsonWebKey): Promise<[string, KeyVerifier]> {
  const keyId = await jwkToKeyID(jwk, helpers.WEBCRYPTO_SHA256, helpers.BASE64URL_DECODE);

  return [keyId, (await verifierFromJWK(jwk)) as unknown as KeyVerifier];
}

async function loadKeys(config: AgentsConfig): Promise<Map<string, KeyVerifier>> {
  return new Map(await Promise.all(config.webBotAuth.keys.map(keyEntry)));
}

function dispatchVerifier(keys: Map<string, KeyVerifier>) {
  return async (data: string, signature: Uint8Array, params: VerifyParams): Promise<string> => {
    const verifyKey = keys.get(params.keyid);

    if (!verifyKey) throw new Error(`Janux: unknown agent keyid "${params.keyid}"`);
    if (params.expires.getTime() < Date.now()) throw new Error('Janux: agent signature expired');
    await verifyKey(data, signature, params);

    return params.keyid;
  };
}

/**
 * Web Bot Auth (RFC 9421) verification against an allowlist of agent JWKs.
 * Fail closed: unknown key, bad signature or expired window ⇒ `verified: false`.
 */
export function createAgentAuth(config: AgentsConfig) {
  let dispatchPromise: Promise<ReturnType<typeof dispatchVerifier>> | undefined;

  const dispatch = () => (dispatchPromise ??= loadKeys(config).then(dispatchVerifier));

  return {
    policy: config.policy ?? 'observe',

    async identify(req: Request): Promise<AgentIdentity | null> {
      if (!req.headers.get('signature')) return null;

      try {
        return { verified: true, keyId: await verify(req, await dispatch()) };
      } catch {
        return { verified: false };
      }
    },
  };
}

export type AgentAuth = ReturnType<typeof createAgentAuth>;
