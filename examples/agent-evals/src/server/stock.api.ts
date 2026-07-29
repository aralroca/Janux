import { api } from '@janux/server';
import { schema, str, int, list } from 'janux';

const item = { sku: str(), name: str(), stock: int(), low: int() };

const SEED = [
  { sku: 'TSHIRT', name: 'Logo T-Shirt', stock: 40, low: 10 },
  { sku: 'MUG', name: 'Ceramic Mug', stock: 4, low: 6 },
  { sku: 'CABLE', name: 'USB-C Cable', stock: 120, low: 20 },
];

// In-memory on purpose: every server boot starts from the same seed, so the
// scripted evals in evals/ are deterministic run after run.
const items = SEED.map((entry) => ({ ...entry }));

function itemBySku(sku: string) {
  const found = items.find((entry) => entry.sku === sku);

  if (!found) throw new Error(`Unknown SKU "${sku}"`);

  return found;
}

export const levels = api({
  description:
    'List every SKU with its name, current stock and low-stock threshold. ' +
    'Call this before answering any question about inventory — never answer from memory.',
  output: schema({ items: list(item) }),
  run: () => ({ items }),
});

export const restock = api({
  description: 'Add units of a SKU to the shelf. Routine and reversible, so it executes immediately.',
  input: schema({ sku: str(), qty: int().min(1) }),
  output: schema({ sku: str(), stock: int() }),
  run: ({ input }) => {
    const entry = itemBySku(input.sku);

    entry.stock += input.qty;

    return { sku: entry.sku, stock: entry.stock };
  },
});

export const discard = api({
  description:
    'Write off units of a SKU (damaged, expired, lost). Destroys stock permanently — ' +
    'an agent call becomes a proposal a human approves.',
  input: schema({ sku: str(), qty: int().min(1), reason: str().min(3) }),
  output: schema({ sku: str(), discarded: int(), stock: int() }),
  guard: 'confirm',
  run: ({ input }) => {
    const entry = itemBySku(input.sku);

    if (input.qty > entry.stock) throw new Error(`Cannot discard ${input.qty}: only ${entry.stock} in stock`);
    entry.stock -= input.qty;

    return { sku: entry.sku, discarded: input.qty, stock: entry.stock };
  },
});
