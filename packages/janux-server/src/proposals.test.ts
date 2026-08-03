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
