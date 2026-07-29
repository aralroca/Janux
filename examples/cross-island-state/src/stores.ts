import { intent, int, list, money, schema, store, str } from 'janux';

function countOf(state: any): number {
  return state.items.reduce((acc: number, item: any) => acc + item.qty, 0);
}

function totalOf(state: any): number {
  return state.items.reduce((acc: number, item: any) => acc + item.qty * item.unitPrice, 0);
}

/**
 * The one cart every island reads. Exported from `src/stores.ts` so SSR can
 * render store-dependent views; the client re-creates it from the serialized
 * snapshot in `boot({ defs })`. `persist: 'local'` routes it through
 * `persistStore` on mount: the cart survives a reload via localStorage.
 *
 * The export name matters: SSR resolves a component's `use: { cart }` against
 * this module's export names, so the export and the alias must match.
 */
export const cart = store({
  name: 'cart',
  description: 'Shared cart state read by every island. Prices are in cents.',
  state: schema({
    items: list({ id: str(), name: str(), qty: int().min(1), unitPrice: money() }),
  }),
  derived: { count: countOf, total: totalOf },
  persist: 'local',
  emits: { 'cart.itemAdded': schema({ id: str(), name: str(), count: int() }) },
  intents: {
    add: intent({
      description: 'Add a product to the shared cart (or bump its quantity)',
      input: schema({ id: str(), name: str(), unitPrice: money(), qty: int().min(1).default(1) }),
      run: ({ state, input, emit }) => {
        const line = state.items.find((item: any) => item.id === input.id);

        if (line) line.qty += input.qty;
        else state.items.push({ id: input.id, name: input.name, qty: input.qty, unitPrice: input.unitPrice });
        emit('cart.itemAdded', { id: input.id, name: input.name, count: countOf(state) });
      },
    }),
    remove: intent({
      description: 'Drop a product line from the cart',
      input: schema({ id: str() }),
      run: ({ state, input }) => {
        state.items = state.items.filter((item: any) => item.id !== input.id);
      },
    }),
    clear: intent({
      description: 'Empty the cart',
      run: ({ state }) => {
        state.items = [];
      },
    }),
  },
});
