import { describe, expect, it } from 'bun:test';
import { DEFAULT_PROPOSAL_TTL_MS, createProposalVault } from './proposals';

/**
 * The proposal vault is the mechanism `guard: 'confirm'` stands on: an approval
 * must execute the proposed call once, unchanged, for the session that parked
 * it, within its TTL. Each test is one way an attacker (or a compromised store)
 * would break that, so each failure mode has a name here before it has a fix.
 */

const parked: string[] = [];

function park(vault: ReturnType<typeof createProposalVault>, input: unknown, session = 'sid=alice') {
  const id = `prop_api_${crypto.randomUUID()}`;

  return vault.park({ id, tool: 'shop.refund', input, execute: async () => parked.push(id), session });
}

describe('proposal vault', () => {
  it('approves a token once: the second attempt finds nothing', () => {
    const vault = createProposalVault();
    const token = park(vault, { amount: 5 });

    expect('record' in vault.approve(token, 'sid=alice')).toBe(true);
    expect(vault.approve(token, 'sid=alice')).toEqual({ error: 'unknown' });
  });

  it('refuses a token whose stored payload changed since it was minted', () => {
    const vault = createProposalVault();
    const input = { amount: 5 };
    const token = park(vault, input);

    input.amount = 5_000_000;
    expect(vault.approve(token, 'sid=alice')).toEqual({ error: 'invalid' });
  });

  it('refuses another session, and the refusal does not consume the proposal', () => {
    const vault = createProposalVault();
    const token = park(vault, { amount: 5 });

    expect(vault.approve(token, 'sid=mallory')).toEqual({ error: 'invalid' });
    expect('record' in vault.approve(token, 'sid=alice')).toBe(true);
  });

  it('refuses a signature spliced from a different proposal', () => {
    const vault = createProposalVault();
    const [idA] = park(vault, { amount: 5 }).split('.');
    const [, sigB] = park(vault, { amount: 9 }).split('.');

    expect(vault.approve(`${idA}.${sigB}`, 'sid=alice')).toEqual({ error: 'invalid' });
  });

  it('refuses a token minted by another server instance', () => {
    const vault = createProposalVault();
    const other = createProposalVault();
    const token = park(vault, { amount: 5 });
    const foreign = park(other, { amount: 5 });
    const [id] = token.split('.');
    const [, foreignSig] = foreign.split('.');

    expect(vault.approve(`${id}.${foreignSig}`, 'sid=alice')).toEqual({ error: 'invalid' });
  });

  it('expires a token after its TTL and consumes it', () => {
    let now = 1_000;
    const vault = createProposalVault({ ttlMs: 50, now: () => now });
    const token = park(vault, { amount: 5 });

    now += 51;
    expect(vault.approve(token, 'sid=alice')).toEqual({ error: 'expired' });
    expect(vault.approve(token, 'sid=alice')).toEqual({ error: 'unknown' });
  });

  it('survives a coffee break by default: five minutes in, the approval still runs', () => {
    let now = 1_000;
    const vault = createProposalVault({ now: () => now });
    const token = park(vault, { amount: 5 });

    now += 5 * 60_000;
    expect('record' in vault.approve(token, 'sid=alice')).toBe(true);
    expect(DEFAULT_PROPOSAL_TTL_MS).toBe(10 * 60_000);
  });

  it('rejects only for the owning session, and a rejected token is gone', () => {
    const vault = createProposalVault();
    const token = park(vault, { amount: 5 });

    expect(vault.reject(token, 'sid=mallory')).toEqual({ error: 'invalid' });
    expect(vault.reject(token, 'sid=alice')).toEqual({ ok: true });
    expect(vault.approve(token, 'sid=alice')).toEqual({ error: 'unknown' });
  });
});

/**
 * What MCP elicitation needs on top: a call parked by a remote agent is settled
 * by a human who is NOT that agent — a different browser, with its own cookies.
 * Binding the signature to the approver's session is exactly right for the
 * in-page flow and exactly wrong here, so the mode is a property of the parked
 * proposal rather than a global loosening.
 */
describe('proposal vault: settled out of band', () => {
  const parkForHuman = (vault: ReturnType<typeof createProposalVault>, input: unknown) => {
    const id = `prop_api_${crypto.randomUUID()}`;

    return vault.park({ id, tool: 'shop.refund', input, execute: async () => 'refunded', session: '', settle: 'token' });
  };

  it('lets a human on another session approve what a cookieless agent parked', () => {
    const vault = createProposalVault();
    const token = parkForHuman(vault, { amount: 5 });

    expect('record' in vault.approve(token, 'sid=the-human')).toBe(true);
  });

  it('still refuses a forged signature when the approver may be anyone', () => {
    const vault = createProposalVault();
    const [id] = parkForHuman(vault, { amount: 5 }).split('.');

    expect(vault.approve(`${id}.not-the-signature`, 'sid=the-human')).toEqual({ error: 'invalid' });
  });

  it('still refuses a payload swapped after the token was minted', () => {
    const vault = createProposalVault();
    const input = { amount: 5 };
    const token = parkForHuman(vault, input);

    input.amount = 5_000_000;
    expect(vault.approve(token, 'sid=the-human')).toEqual({ error: 'invalid' });
  });

  it('remembers what happened, so the agent that parked it can collect the outcome', () => {
    const vault = createProposalVault();
    const token = parkForHuman(vault, { amount: 5 });

    expect(vault.outcome(token)).toBeUndefined();
    vault.approve(token, 'sid=the-human');
    vault.settled(token.split('.')[0]!, { ok: true, result: 'refunded' });

    expect(vault.outcome(token)).toEqual({ ok: true, result: 'refunded' });
  });

  it('remembers a rejection as a rejection, not as an absence', () => {
    const vault = createProposalVault();
    const token = parkForHuman(vault, { amount: 5 });

    vault.reject(token, 'sid=the-human');
    vault.settled(token.split('.')[0]!, { ok: false });

    expect(vault.outcome(token)).toEqual({ ok: false });
  });

  it('hands the outcome only to a token that verifies — the bare id collects nothing', () => {
    const vault = createProposalVault();
    const token = parkForHuman(vault, { amount: 5 });
    const [id] = token.split('.');

    vault.approve(token, 'sid=the-human');
    vault.settled(id!, { ok: true, result: 'refunded' });

    expect(vault.outcome(`${id}.not-the-signature`)).toBeUndefined();
    expect(vault.outcome(id!)).toBeUndefined();
  });

  it('shows a holder of the token what is waiting, so a human can read it before settling', () => {
    const vault = createProposalVault();
    const token = parkForHuman(vault, { amount: 5 });
    const [id] = token.split('.');

    expect(vault.pending(token)).toEqual({ tool: 'shop.refund', input: { amount: 5 } });
    expect(vault.pending(`${id}.not-the-signature`)).toBeUndefined();
    vault.approve(token, 'sid=the-human');
    expect(vault.pending(token)).toBeUndefined();
  });

  it('does not show an in-page proposal through the out-of-band door', () => {
    const vault = createProposalVault();
    const token = park(vault, { amount: 5 });

    expect(vault.pending(token)).toBeUndefined();
  });

  it('forgets an outcome nobody collected once the proposal would have expired', () => {
    let now = 1_000;
    const vault = createProposalVault({ ttlMs: 50, now: () => now });
    const token = parkForHuman(vault, { amount: 5 });

    vault.approve(token, 'sid=the-human');
    vault.settled(token.split('.')[0]!, { ok: true, result: 'refunded' });
    now += 51;

    expect(vault.outcome(token)).toBeUndefined();
  });
});
