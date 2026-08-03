import type { Case } from '../support/case';

/**
 * The proposal token as a capability under attack.
 *
 * `guard: 'confirm'` parks an agent's call and hands back a token; whoever
 * presents it to `/_janux/approve` executes the parked call. SECURITY.md names
 * this surface directly ("Proposal replay — executing an approved proposal more
 * than once"), and every human-in-the-loop claim rests on it. One row per
 * attacker: the replayer (same token twice), the late sender (past the TTL),
 * the foreign session (someone else's browser presenting an observed token),
 * and the splicer (a signature minted for a different payload).
 *
 * Sources: OWASP Session Management Cheat Sheet ("binding the session ID to
 * other user properties"); RFC 6749 §10.5 (single-use authorization codes).
 */
export interface ProposalThreatCase {
  /** Server-side proposal TTL; absent ⇒ the framework default. */
  ttlMs?: number;
  steps: ThreatStep[];
  /** One line per step; a step with `recordEffects` adds `side:<what ran>`. */
  expected: string[];
}

export type ThreatStep =
  | { kind: 'propose'; cookie?: string; amount?: number }
  | { kind: 'sleep'; ms: number }
  | { kind: 'approve'; cookie?: string; token?: TokenPick; recordEffects?: boolean };

/** The credential a step presents: a parked token by index (default: the latest), or a forgery spliced from two. */
export type TokenPick = number | { spliced: [idOf: number, sigOf: number] };

export type ProposalThreatRow = Case<ProposalThreatCase>;

const ALICE = 'sid=alice';
const MALLORY = 'sid=mallory';
const INVALID = '403 {"ok":false,"error":"proposal token does not match this session and payload"}';

export const PROPOSAL_THREAT_CASES: ProposalThreatRow[] = [
  {
    id: 'security-proposal-an-approved-token-cannot-be-approved-again',
    src: 'janux',
    steps: [
      { kind: 'propose', cookie: ALICE, amount: 5 },
      { kind: 'approve', cookie: ALICE, recordEffects: true },
      { kind: 'approve', cookie: ALICE, recordEffects: true },
    ],
    expected: [
      '200 <proposal>',
      '200 {"ok":true,"result":"transferred 5"}',
      'side:transfer:5',
      '404 {"ok":false,"error":"unknown proposal"}',
      'side:transfer:5',
    ],
  },
  {
    id: 'security-proposal-a-token-cannot-be-approved-past-its-ttl',
    src: 'janux',
    ttlMs: 1,
    steps: [
      { kind: 'propose', cookie: ALICE, amount: 5 },
      { kind: 'sleep', ms: 20 },
      { kind: 'approve', cookie: ALICE, recordEffects: true },
    ],
    expected: ['200 <proposal>', '410 {"ok":false,"error":"proposal expired"}', 'side:'],
  },
  {
    id: 'security-proposal-a-token-cannot-be-approved-from-another-session',
    src: 'janux',
    steps: [
      { kind: 'propose', cookie: ALICE, amount: 5 },
      { kind: 'approve', cookie: MALLORY, recordEffects: true },
      // The foreign attempt must not have consumed it: the owner still decides.
      { kind: 'approve', cookie: ALICE, recordEffects: true },
    ],
    expected: [
      '200 <proposal>',
      INVALID,
      'side:',
      '200 {"ok":true,"result":"transferred 5"}',
      'side:transfer:5',
    ],
  },
  {
    id: 'security-proposal-a-token-signed-for-another-payload-cannot-approve-this-one',
    src: 'janux',
    steps: [
      { kind: 'propose', cookie: ALICE, amount: 5 },
      { kind: 'propose', cookie: ALICE, amount: 9_000_000 },
      { kind: 'approve', cookie: ALICE, token: { spliced: [0, 1] }, recordEffects: true },
      // The honest token still approves exactly what was proposed.
      { kind: 'approve', cookie: ALICE, token: 0, recordEffects: true },
    ],
    expected: [
      '200 <proposal>',
      '200 <proposal>',
      INVALID,
      'side:',
      '200 {"ok":true,"result":"transferred 5"}',
      'side:transfer:5',
    ],
  },
];
