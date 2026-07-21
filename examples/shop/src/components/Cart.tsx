import { component, intent, source, effect, schema, str, int, money, list } from 'janux';
import { catalog, saveCart, pay } from '../server/shop.api';

export const Cart = component({
  name: 'cart',
  description: 'Shopping cart with line items. Prices are in cents.',

  state: schema({
    items: list({ productId: str(), name: str(), qty: int().min(1), unitPrice: money() }),
    lastOrderId: str().nullable(),
  }),

  derived: {
    total: (s: any) => s.items.reduce((acc: number, item: any) => acc + item.qty * item.unitPrice, 0),
  },

  sources: {
    catalog: source({
      description: 'Product catalog',
      query: () => catalog({}),
    }),
  },

  effects: {
    persist: effect({
      description: 'Syncs the cart to the server on every change',
      when: (s: any) => s.items,
      debounce: '300ms',
      run: ({ state }) =>
        saveCart({ items: state.items.map((item: any) => ({ productId: item.productId, qty: item.qty })) }).then(
          () => {},
        ),
    }),
  },

  emits: {
    'cart.checkedOut': schema({ orderId: str(), total: money() }),
  },

  intents: {
    addItem: intent({
      description: 'Add a product to the cart by id',
      input: schema({ productId: str(), qty: int().min(1).default(1) }),
      ready: ({ sources }: any) => !sources.catalog.pending,
      run: ({ state, sources, input }: any) => {
        const product = sources.catalog.value.products.find((p: any) => p.id === input.productId);

        if (!product) throw new Error(`Unknown product "${input.productId}"`);
        const line = state.items.find((item: any) => item.productId === product.id);

        if (line) line.qty += input.qty;
        else state.items.push({ productId: product.id, name: product.name, qty: input.qty, unitPrice: product.price });
      },
    }),

    removeItem: intent({
      description: 'Remove a product from the cart',
      input: schema({ productId: str() }),
      run: ({ state, input }: any) => {
        state.items = state.items.filter((item: any) => item.productId !== input.productId);
      },
    }),

    checkout: intent({
      description: 'Pay for the cart. Has monetary side effects.',
      guard: 'confirm',
      run: async ({ state, derived, emit }: any) => {
        const order: any = await pay({ total: derived.total });

        state.lastOrderId = order.orderId;
        state.items = [];
        emit('cart.checkedOut', { orderId: order.orderId, total: order.charged });
      },
    }),
  },

  view: ({ state, derived, sources, intents }: any) => (
    <section class="cart">
      <h2>Cart</h2>
      {sources.catalog.pending ? (
        <p>Loading catalog…</p>
      ) : (
        <ul class="catalog">
          {sources.catalog.value.products.map((product: any) => (
            <li key={product.id}>
              {product.name} — {(product.price / 100).toFixed(2)}€{' '}
              <button on={intents.addItem} data-input={JSON.stringify({ productId: product.id })}>
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul class="items">
        {state.items.map((item: any) => (
          <li key={item.productId}>
            {item.name} ×{item.qty}
          </li>
        ))}
      </ul>
      <p class="total">Total: {(derived.total / 100).toFixed(2)}€</p>
      {state.lastOrderId ? <p class="order">Order {state.lastOrderId} ✔</p> : null}
      <button on={intents.checkout}>Pay</button>
    </section>
  ),
});
