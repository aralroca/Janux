import { api } from '@janux/server';
import { schema, str, int, money, list, obj } from 'janux';

const PRODUCTS = [
  { id: 'p1', name: 'Blue Sneakers', price: 5999 },
  { id: 'p2', name: 'Red Backpack', price: 3499 },
  { id: 'p3', name: 'Green Hoodie', price: 4599 },
];

const savedCarts = new Map<string, unknown>();

export const catalog = api({
  description: 'List products with prices (minor units)',
  output: schema({ products: list({ id: str(), name: str(), price: money() }) }),
  run: () => ({ products: PRODUCTS }),
});

export const saveCart = api({
  description: 'Persist the cart server-side',
  input: schema({ items: list({ productId: str(), qty: int() }) }),
  run: ({ input, ctx }) => {
    savedCarts.set(String(ctx.userId ?? 'anonymous'), input.items);

    return { saved: input.items.length };
  },
});

export const pay = api({
  description: 'Charge the cart. Irreversible monetary action.',
  input: schema({ total: money() }),
  output: schema({ orderId: str(), charged: money() }),
  guard: 'confirm',
  run: ({ input }) => ({ orderId: `ord_${Math.random().toString(36).slice(2, 8)}`, charged: input.total }),
});

export const orderStatus = api({
  description: 'Look up an order by id',
  input: schema({ orderId: str() }),
  run: ({ input }) => ({ orderId: input.orderId, status: 'paid' }),
});
