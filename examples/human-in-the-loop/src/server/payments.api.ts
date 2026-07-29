import { api } from '@janux/server';
import { list, money, schema, str } from 'janux';

/** Executed transfers only — a proposal that is never approved leaves no trace here. */
const LEDGER: { transferId: string; to: string; amountCents: number }[] = [];

export const transfer = api({
  description:
    'Wire money to a payee (amount in cents). Irreversible monetary action: ' +
    'agent-origin calls come back as a proposal a human settles via /_janux/approve.',
  input: schema({ to: str().min(1), amountCents: money() }),
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
