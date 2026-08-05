import { api } from '@janux/server';
import { schema, str } from 'janux';

/** Demo ledger: a Map so a refund is visible on the page after a reload. */
export const INVOICES = new Map([
  ['A-1001', { order: 'A-1001', amountUsd: 49, status: 'paid' }],
  ['A-1002', { order: 'A-1002', amountUsd: 19, status: 'refund-requested' }],
]);

export const invoice = api({
  description: 'Look one invoice up by order id.',
  input: schema({ order: str().min(1) }),
  run: ({ input }) => INVOICES.get(input.order) ?? { error: `no invoice for order ${input.order}` },
});

export const refund = api({
  description: 'Refund an order. Demo-only: it marks the invoice refunded in memory.',
  input: schema({ order: str().min(1) }),
  run: ({ input }) => {
    const entry = INVOICES.get(input.order);

    if (!entry) return { error: `no invoice for order ${input.order}` };
    INVOICES.set(input.order, { ...entry, status: 'refunded' });

    return { refunded: input.order, amountUsd: entry.amountUsd };
  },
});
