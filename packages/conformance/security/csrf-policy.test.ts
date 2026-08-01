import { describe, expect } from 'bun:test';
import { refuseCrossSite, type CsrfPolicy } from '../../janux-server/src/csrf';
import { runCases } from '../support/scenario';
import { CSRF_POLICY_CASES, type CsrfPolicyRow } from './csrf-policy.cases';

/**
 * The decision, read off the refusal it produces: no response at all means the
 * request continues to the route, a 403 means forgery, a 405 means the verb is not
 * a read here. Asserted together with the envelope, because an app's error handler
 * and its client both branch on that body.
 *
 * `verifierUnused` rows additionally pin that the expensive check was never made —
 * a signature verification per same-origin request is both a performance bug and a
 * way to reach key material from a path that should not touch it.
 */
const VERIFIERS: Record<string, () => Promise<boolean>> = {
  yes: () => Promise.resolve(true),
  no: () => Promise.resolve(false),
  throws: () => {
    throw new Error('malformed Signature-Input');
  },
};

interface Outcome {
  verdict: 'pass' | 'forgery' | 'method';
  body: unknown;
  consulted: number;
}

async function decide(row: CsrfPolicyRow): Promise<Outcome> {
  let consulted = 0;
  const verify = row.verify ? VERIFIERS[row.verify]! : undefined;
  const policy: CsrfPolicy = {
    allowedOrigins: row.allowedOrigins,
    verifiedAgent: verify && (() => {
      consulted += 1;

      return verify();
    }),
  };
  const request = new Request(`http://test${row.path}`, { method: row.method, headers: row.headers });
  const refusal = await refuseCrossSite(request, row.path, policy);

  if (!refusal) return { verdict: 'pass', body: undefined, consulted };

  return { verdict: refusal.status === 405 ? 'method' : 'forgery', body: await refusal.json(), consulted };
}

const ENVELOPE = {
  forgery: { ok: false, error: 'cross_site_denied' },
  method: { ok: false, error: 'method_not_allowed' },
};

describe('cross-site decision', () =>
  runCases(CSRF_POLICY_CASES, async (row) => {
    const outcome = await decide(row);

    expect(outcome.verdict).toBe(row.expected);
    if (row.expected !== 'pass') expect(outcome.body).toEqual(ENVELOPE[row.expected]);
    if (row.verifierUnused) expect(outcome.consulted).toBe(0);
  }));
