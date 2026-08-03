import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The vault behind `guard: 'confirm'`: parked calls, and the tokens that settle them.
 *
 * A parked proposal is a capability — whoever presents its token to
 * `/_janux/approve` executes the call. So the token is more than an unguessable
 * id: it carries an HMAC over the proposal id, the proposer's session and the
 * payload's hash, under a key that never leaves this server instance. Approval
 * re-derives the signature from the *approving* request's session and the
 * *currently stored* input, so a replayed, foreign-session, payload-swapped or
 * cross-instance token all fail the same comparison. Spans and audit entries
 * carry only the bare id, which on its own no longer approves anything.
 */
export interface PendingApiProposal {
  id: string;
  tool: string;
  input: unknown;
  execute: () => Promise<unknown>;
  session: string;
  expiresAt: number;
}

export type SettleError = 'unknown' | 'invalid' | 'expired';

/**
 * Long enough for the approver to come back with a coffee, short enough that a
 * token lifted from a log or backup is dead on arrival.
 */
export const DEFAULT_PROPOSAL_TTL_MS = 10 * 60_000;

const MAX_PENDING_PROPOSALS = 100;
const PROPOSAL_SESSION = Symbol('janux.proposal.session');

/**
 * An unguessable proposal id. `POST /_janux/approve` looks a proposal up by id
 * in a server-wide map, so while ids were a shared counter (`prop_api_1`, …)
 * any client could approve another user's `confirm`-guarded call by sending a
 * small integer. The id is the lookup key; the vault's signature is what makes
 * it a credential.
 */
export function proposalId(scope: string): string {
  return `prop_${scope}_${crypto.randomUUID()}`;
}

/**
 * The session a proposal binds to: whatever credentials the caller's browser
 * holds. No framework cookie is minted — same browser ⇒ same header ⇒ same
 * session, and a cookieless caller (a test, a remote agent) binds to the empty
 * one. Hashed so the vault never retains the credentials themselves.
 */
export function sessionOf(req: Request): string {
  return sha256(req.headers.get('cookie') ?? '');
}

/** Threads the proposer's session through `ctx`, invisibly to app code (symbol key, never serialized). */
export function withProposalSession<T extends object>(ctx: T, session: string): T {
  return { ...ctx, [PROPOSAL_SESSION]: session };
}

export function proposalSessionOf(ctx: object): string {
  return ((ctx as Record<symbol, unknown>)[PROPOSAL_SESSION] as string | undefined) ?? '';
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function hashPayload(input: unknown): string {
  return sha256(JSON.stringify(input) ?? 'undefined');
}

interface VaultOptions {
  ttlMs?: number;
  /** Injectable clock, so expiry is testable without sleeping. */
  now?: () => number;
}

type Parked = Omit<PendingApiProposal, 'expiresAt'>;
type Settled = { record: PendingApiProposal } | { error: SettleError };

export function createProposalVault({ ttlMs = DEFAULT_PROPOSAL_TTL_MS, now = Date.now }: VaultOptions = {}) {
  const key = randomBytes(32);
  const proposals = new Map<string, PendingApiProposal>();

  const sign = (id: string, session: string, payloadHash: string): string =>
    createHmac('sha256', key).update(`${id}\n${session}\n${payloadHash}`).digest('base64url');

  const matches = (sig: string, record: PendingApiProposal, session: string): boolean => {
    const expected = Buffer.from(sign(record.id, session, hashPayload(record.input)));
    const presented = Buffer.from(sig);

    return presented.length === expected.length && timingSafeEqual(presented, expected);
  };

  const evict = (): void => {
    proposals.forEach((record, id) => now() > record.expiresAt && proposals.delete(id));
    const oldest = proposals.keys().next().value;

    if (proposals.size >= MAX_PENDING_PROPOSALS && oldest) proposals.delete(oldest);
  };

  const park = (proposal: Parked): string => {
    evict();
    proposals.set(proposal.id, { ...proposal, expiresAt: now() + ttlMs });

    return `${proposal.id}.${sign(proposal.id, proposal.session, hashPayload(proposal.input))}`;
  };

  /**
   * Single-use by construction: look-up, verification and consumption happen in
   * one synchronous pass, so two racing approvals cannot both take the record.
   * A failed signature does NOT consume — an attacker presenting a stolen id
   * must not be able to cancel the decision the owner still gets to make.
   */
  const approve = (token: string, session: string): Settled => {
    const [id = '', sig = ''] = token.split('.');
    const record = proposals.get(id);

    if (!record) return { error: 'unknown' };
    if (!matches(sig, record, session)) return { error: 'invalid' };
    proposals.delete(id);
    if (now() > record.expiresAt) return { error: 'expired' };

    return { record };
  };

  /** Rejecting an expired proposal is still a rejection — it is gone either way. */
  const reject = (token: string, session: string): { ok: true } | { error: Exclude<SettleError, 'expired'> } => {
    const settled = approve(token, session);

    if ('record' in settled || settled.error === 'expired') return { ok: true };

    return { error: settled.error };
  };

  return { park, approve, reject };
}
