import { api } from '@janux/server';
import { list, money, schema, str } from 'janux';

/** Executed transfers only — a proposal that is never approved leaves no trace here. */
const LEDGER: { transferId: string; to: string; amountCents: number }[] = [];

export const transfer = api({
  description:
    'Wire money to a payee (amount in cents). Irreversible monetary action: ' +
    'agent-origin calls come back as a proposal a human settles via /_janux/approve.',
  // Defaults are the example payload an agent (or the panel) starts from: a
  // real payee and a real invoice amount, so "call it" moves plausible money
  // instead of one cent to "example".
  input: schema({ to: str().min(1).default('Orbit Freight'), amountCents: money().default(24500) }),
  output: schema({ transferId: str(), to: str(), amountCents: money() }),
  guard: 'confirm',
  run: ({ input }) => {
    const executed = {
      transferId: `tr_${crypto.randomUUID().slice(0, 8)}`,
      to: input.to,
      amountCents: input.amountCents,
    };

    LEDGER.push(executed);

    return executed;
  },
});

export const ledger = api({
  description: 'Every transfer that actually executed, newest first. Rejected proposals never appear here.',
  output: schema({ transfers: list({ transferId: str(), to: str(), amountCents: money() }) }),
  run: () => ({ transfers: [...LEDGER].reverse() }),
});
