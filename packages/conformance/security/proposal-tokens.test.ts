import { describe, expect } from 'bun:test';
import { api, createJanuxServer } from '@janux/server';
import { int, jsx, schema } from 'janux';
import { runCases } from '../support/scenario';
import { PROPOSAL_THREAT_CASES, type ProposalThreatRow, type ThreatStep, type TokenPick } from './proposal-tokens.cases';

/**
 * One fresh server per row — the vault is per instance, and a row is a scripted
 * attack whose whole point is which earlier step consumed (or failed to
 * consume) the token. `side:` lines record what the app actually executed,
 * because a refusal only counts if nothing ran.
 */

/** Everything the app did, in order. Reset per row. */
let effects: string[] = [];

function makeServer(ttlMs?: number): ReturnType<typeof createJanuxServer> {
  return createJanuxServer({
    routes: { '/': () => jsx('main', {}) },
    proposalTtlMs: ttlMs,
    apis: {
      pay: {
        transfer: api({
          description: 'Transfer. Irreversible.',
          guard: 'confirm',
          input: schema({ amount: int().default(1) }),
          run: ({ input }) => {
            const { amount } = input as { amount: number };

            effects.push(`transfer:${amount}`);

            return `transferred ${amount}`;
          },
        }),
      },
    },
  });
}

function post(path: string, body: unknown, cookie?: string, agent = false): Request {
  return new Request(`http://test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: 'http://test',
      ...(cookie ? { cookie } : {}),
      ...(agent ? { 'x-janux-origin': 'agent' } : {}),
    },
  });
}

/** A spliced pick forges `idOf`'s id with `sigOf`'s signature — the mix-and-match attack. */
function pickToken(tokens: string[], pick: TokenPick = tokens.length - 1): string {
  if (typeof pick === 'number') return tokens[pick]!;
  const [id] = tokens[pick.spliced[0]]!.split('.');
  const [, sig] = tokens[pick.spliced[1]]!.split('.');

  return `${id}.${sig}`;
}

async function propose(server: ReturnType<typeof makeServer>, step: ThreatStep & { kind: 'propose' }, tokens: string[]): Promise<string> {
  const response = await server.fetch(post('/_janux/api/pay.transfer', { amount: step.amount }, step.cookie, true));
  const body: any = await response.json();

  if (body?.result?.status === 'proposal') tokens.push(body.result.id);

  return body?.result?.status === 'proposal' ? '200 <proposal>' : `${response.status} ${JSON.stringify(body)}`;
}

async function approve(server: ReturnType<typeof makeServer>, step: ThreatStep & { kind: 'approve' }, tokens: string[]): Promise<string> {
  const response = await server.fetch(post('/_janux/approve', { id: pickToken(tokens, step.token) }, step.cookie));

  return `${response.status} ${await response.text()}`;
}

async function runStep(server: ReturnType<typeof makeServer>, step: ThreatStep, tokens: string[], log: string[]): Promise<void> {
  if (step.kind === 'sleep') return Bun.sleep(step.ms);
  if (step.kind === 'propose') log.push(await propose(server, step, tokens));
  if (step.kind === 'approve') {
    log.push(await approve(server, step, tokens));
    if (step.recordEffects) log.push(`side:${effects.join(',')}`);
  }
}

async function runRow(row: ProposalThreatRow): Promise<string[]> {
  const server = makeServer(row.ttlMs);
  const tokens: string[] = [];
  const log: string[] = [];

  for (const step of row.steps) await runStep(server, step, tokens, log);

  return log;
}

describe('the proposal token under attack', () =>
  runCases(PROPOSAL_THREAT_CASES, async (row) => {
    effects = [];

    expect(await runRow(row)).toEqual(row.expected);
  }));
