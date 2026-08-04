import { api } from '@janux/server';
import { schema, str, int, bool, list } from 'janux';

/**
 * A returns desk with one non-obvious rule: a refund is refused unless it
 * carries the policy code for the *reason* the customer gave. The code is
 * issued per reason by `policy` and cannot be guessed, which is exactly the
 * kind of thing a tool description has no room to teach and a skill does.
 */

const SEED_ORDERS = [
  { id: 'A-1001', sku: 'MUG', qty: 2, paid: 1800, reason: 'damaged', status: 'open' },
  { id: 'A-1002', sku: 'TSHIRT', qty: 1, paid: 2500, reason: 'wrong-size', status: 'open' },
  { id: 'A-1003', sku: 'CABLE', qty: 3, paid: 2700, reason: 'changed-mind', status: 'open' },
];

const SEED_STOCK = [
  { sku: 'MUG', stock: 4 },
  { sku: 'TSHIRT', stock: 40 },
  { sku: 'CABLE', stock: 120 },
];

const POLICIES: Record<string, { code: string; restock: boolean; windowDays: number }> = {
  damaged: { code: 'RET-DMG-7', restock: false, windowDays: 30 },
  'wrong-size': { code: 'RET-SIZ-2', restock: true, windowDays: 14 },
  'changed-mind': { code: 'RET-CHG-9', restock: true, windowDays: 7 },
};

// In-memory on purpose: every boot starts from the same seed, so the scripted
// scenarios in evals/ are deterministic run after run.
const orders = SEED_ORDERS.map((entry) => ({ ...entry }));
const stock = SEED_STOCK.map((entry) => ({ ...entry }));

function orderById(id: string) {
  const found = orders.find((entry) => entry.id === id);

  if (!found) throw new Error(`Unknown order "${id}"`);

  return found;
}

function policyFor(reason: string) {
  const found = POLICIES[reason];

  if (!found) throw new Error(`No return policy for reason "${reason}"`);

  return found;
}

const orderShape = { id: str(), sku: str(), qty: int(), paid: int(), reason: str(), status: str() };

export const orders_list = api({
  description: 'List every open return request with its SKU, amount paid and the reason the customer gave.',
  output: schema({ orders: list(orderShape) }),
  run: () => ({ orders }),
});

export const order = api({
  description: 'Read one return request by its order id. Start here: the reason it carries decides the policy.',
  input: schema({ id: str() }),
  output: schema(orderShape),
  run: ({ input }) => orderById(input.id),
});

export const policy = api({
  description:
    'Issue the refund policy for a return reason: the policy code a refund must carry, ' +
    'whether the item goes back on the shelf, and the return window in days.',
  input: schema({ reason: str() }),
  output: schema({ code: str(), restock: bool(), windowDays: int() }),
  run: ({ input }) => policyFor(input.reason),
});

export const refund = api({
  description:
    'Refund a return request. Requires the policy code issued for that order reason. ' +
    'Money leaves the account, so an agent call becomes a proposal a human approves.',
  input: schema({ orderId: str(), policyCode: str() }),
  output: schema({ orderId: str(), refunded: int(), restockRequired: bool(), sku: str(), qty: int() }),
  guard: 'confirm',
  run: ({ input }) => {
    const entry = orderById(input.orderId);
    const rule = policyFor(entry.reason);

    if (entry.status !== 'open') throw new Error(`Order ${entry.id} is already ${entry.status}`);
    if (input.policyCode !== rule.code) {
      throw new Error(
        `Refund refused: "${input.policyCode}" is not the policy code for reason "${entry.reason}" — ` +
          'ask api.returns.policy for it first.',
      );
    }
    entry.status = 'refunded';

    return { orderId: entry.id, refunded: entry.paid, restockRequired: rule.restock, sku: entry.sku, qty: entry.qty };
  },
});

export const restock = api({
  description: 'Put returned units back on the shelf. Only for reasons whose policy says the item is resellable.',
  input: schema({ sku: str(), qty: int().min(1) }),
  output: schema({ sku: str(), stock: int() }),
  run: ({ input }) => {
    const entry = stock.find((item) => item.sku === input.sku);

    if (!entry) throw new Error(`Unknown SKU "${input.sku}"`);
    entry.stock += input.qty;

    return { sku: entry.sku, stock: entry.stock };
  },
});

export const levels = api({
  description: 'Current stock per SKU. Read it to confirm a restock landed.',
  output: schema({ items: list({ sku: str(), stock: int() }) }),
  run: () => ({ items: stock }),
});
