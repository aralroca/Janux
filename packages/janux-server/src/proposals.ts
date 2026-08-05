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
  /**
   * Who the signature is checked against. `'session'` (the default) is the
   * in-page flow: the approver must be the browser that parked it. `'token'` is
   * the out-of-band flow MCP elicitation needs — a cookieless agent parks the
   * call and a human on a different session settles it, so the token itself is
   * the capability and the stored session is what it is verified against.
   */
  settle?: 'session' | 'token';
}

/** What became of a settled proposal, for whoever parked it and was not there to watch. */
export type ProposalOutcome = { ok: true; result: unknown } | { ok: false };

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
  /**
   * What a settled out-of-band proposal turned into, kept only until the
   * proposal itself would have expired. The signing material outlives the
   * record on purpose: the agent collects with the same token it was handed, so
   * a settlement is no more readable than the proposal was.
   */
  const settlements = new Map<string, { session: string; payloadHash: string; expiresAt: number; outcome?: ProposalOutcome }>();

  const sign = (id: string, session: string, payloadHash: string): string =>
    createHmac('sha256', key).update(`${id}\n${session}\n${payloadHash}`).digest('base64url');

  const signatureIs = (sig: string, id: string, session: string, payloadHash: string): boolean => {
    const expected = Buffer.from(sign(id, session, payloadHash));
    const presented = Buffer.from(sig);

    return presented.length === expected.length && timingSafeEqual(presented, expected);
  };

  /** Out of band, the stored session is the one that signed — see `settle`. */
  const matches = (sig: string, record: PendingApiProposal, session: string): boolean =>
    signatureIs(sig, record.id, record.settle === 'token' ? record.session : session, hashPayload(record.input));

  /** Drops the oldest entry of a map that has reached its ceiling — insertion order is age. */
  const capped = (entries: Map<string, unknown>, max: number): void => {
    const oldest = entries.keys().next().value;

    if (entries.size >= max && oldest) entries.delete(oldest);
  };

  /**
   * A settlement holds the call's *result* until someone collects it, so the
   * tape needs the same ceiling the pending side has: expiry alone bounds how
   * long an uncollected outcome lives, not how many pile up before then.
   */
  const evict = (): void => {
    proposals.forEach((record, id) => now() > record.expiresAt && proposals.delete(id));
    settlements.forEach((entry, id) => now() > entry.expiresAt && settlements.delete(id));
    capped(proposals, MAX_PENDING_PROPOSALS);
    capped(settlements, MAX_PENDING_PROPOSALS);
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
    if (record.settle === 'token') {
      settlements.set(id, { session: record.session, payloadHash: hashPayload(record.input), expiresAt: record.expiresAt });
    }

    return { record };
  };

  /** Rejecting an expired proposal is still a rejection — it is gone either way. */
  const reject = (token: string, session: string): { ok: true } | { error: Exclude<SettleError, 'expired'> } => {
    const settled = approve(token, session);

    if ('record' in settled || settled.error === 'expired') return { ok: true };

    return { error: settled.error };
  };

  /**
   * What a still-parked proposal is proposing, to whoever holds its token — the
   * page a human lands on has to show what they are about to settle. Only the
   * out-of-band flow answers here: an in-page proposal is settled by the session
   * that parked it, and has no reason to be readable by anyone else.
   */
  const pending = (token: string): { tool: string; input: unknown } | undefined => {
    const [id = '', sig = ''] = token.split('.');
    const record = proposals.get(id);

    if (!record || record.settle !== 'token' || now() > record.expiresAt) return undefined;

    return matches(sig, record, '') ? { tool: record.tool, input: record.input } : undefined;
  };

  /** Records what the settlement ran to, for an agent that will come back asking. */
  const settled = (id: string, outcome: ProposalOutcome): void => {
    const entry = settlements.get(id);

    if (entry) entry.outcome = outcome;
  };

  /** The outcome, to whoever still holds the token that parked it — never to a bare id. */
  const outcome = (token: string): ProposalOutcome | undefined => {
    const [id = '', sig = ''] = token.split('.');
    const entry = settlements.get(id);

    if (!entry || now() > entry.expiresAt) return undefined;

    return signatureIs(sig, id, entry.session, entry.payloadHash) ? entry.outcome : undefined;
  };

  return { park, approve, reject, pending, settled, outcome };
}
