import { component, intent, source, effect, schema, str, int, money, list } from 'janux';
import { catalog, saveCart, pay } from '../server/shop.api';

const ART: Record<string, string> = { p1: '👟', p2: '🎒', p3: '🧥' };
const COUPONS: Record<string, number> = { SAVE10: 10 };

function subtotalOf(state: any): number {
  return state.items.reduce((acc: number, item: any) => acc + item.qty * item.unitPrice, 0);
}

function discountOf(state: any): number {
  const pct = COUPONS[state.coupon ?? ''] ?? 0;

  return Math.round((subtotalOf(state) * pct) / 100);
}

export const Cart = component({
  name: 'cart',
  description: 'Shopping cart with line items, quantities and coupons. Prices are in cents.',

  state: schema({
    items: list({ productId: str(), name: str(), qty: int().min(1), unitPrice: money() }),
    coupon: str().nullable(),
    lastOrderId: str().nullable(),
  }),

  derived: {
    subtotal: subtotalOf,
    discount: discountOf,
    total: (s: any) => subtotalOf(s) - discountOf(s),
  },

  sources: {
    catalog: source({ description: 'Product catalog', query: () => catalog({}) }),
  },

  effects: {
    persist: effect({
      description: 'Syncs the cart to the server on every change',
      when: (s: any) => s.items,
      debounce: '300ms',
      run: ({ state }: any) =>
        saveCart({ items: state.items.map((item: any) => ({ productId: item.productId, qty: item.qty })) }).then(
          () => {},
        ),
    }),
  },

  emits: { 'cart.checkedOut': schema({ orderId: str(), total: money() }) },

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

    changeQty: intent({
      description: 'Change a line quantity by a delta (removes the line at zero)',
      input: schema({ productId: str(), delta: int() }),
      run: ({ state, input }: any) => {
        const line = state.items.find((item: any) => item.productId === input.productId);

        if (!line) return;
        line.qty += input.delta;
        if (line.qty < 1) state.items = state.items.filter((item: any) => item.productId !== input.productId);
      },
    }),

    removeItem: intent({
      description: 'Remove a product line from the cart',
      input: schema({ productId: str() }),
      run: ({ state, input }: any) => {
        state.items = state.items.filter((item: any) => item.productId !== input.productId);
      },
    }),

    applyCoupon: intent({
      description: 'Apply a discount coupon (try SAVE10)',
      input: schema({ code: str().min(1) }),
      run: ({ state, input }: any) => {
        const code = input.code.toUpperCase();

        if (!COUPONS[code]) throw new Error(`Unknown coupon "${input.code}"`);
        state.coupon = code;
      },
    }),

    clear: intent({
      description: 'Empty the cart entirely, coupon included',
      guard: 'confirm',
      ready: ({ state }: any) => state.items.length > 0,
      run: ({ state }: any) => {
        state.items = [];
        state.coupon = null;
      },
    }),

    checkout: intent({
      description: 'Pay for the cart. Has monetary side effects.',
      guard: 'confirm',
      ready: ({ state }: any) => state.items.length > 0,
      run: async ({ state, derived, emit }: any) => {
        const order: any = await pay({ total: derived.total });

        state.lastOrderId = order.orderId;
        state.items = [];
        state.coupon = null;
        emit('cart.checkedOut', { orderId: order.orderId, total: order.charged });
      },
    }),
  },

  view: ({ state, derived, sources, intents }: any) => (
    <div class="shop-grid">
      <section class="catalog">
        {sources.catalog.pending ? (
          <p>Loading catalog…</p>
        ) : (
          sources.catalog.value.products.map((product: any) => (
            <article key={product.id} class="product" onDoubleClick={intents.addItem.with({ productId: product.id })}>
              <span class="art">{ART[product.id] ?? '📦'}</span>
              <h3>{product.name}</h3>
              <p class="price">{(product.price / 100).toFixed(2)}€</p>
              <button onClick={intents.addItem.with({ productId: product.id })}>
                Add to cart
              </button>
            </article>
          ))
        )}
      </section>

      <aside class="cart">
        <h2>Cart</h2>
        {state.items.length === 0 ? <p class="empty">Your cart is empty.</p> : null}
        <ul class="items">
          {state.items.map((item: any) => (
            <li key={item.productId}>
              <span class="art">{ART[item.productId] ?? '📦'}</span>
              <span class="name">{item.name}</span>
              <span class="qty">
                <button onClick={intents.changeQty.with({ productId: item.productId, delta: -1 })}>
                  −
                </button>
                {item.qty}
                <button onClick={intents.changeQty.with({ productId: item.productId, delta: 1 })}>
                  +
                </button>
              </span>
              <button class="x" onClick={intents.removeItem.with({ productId: item.productId })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form class="coupon" onSubmit={intents.applyCoupon}>
          <input name="code" placeholder="Coupon (try SAVE10)" />
          <button type="submit">Apply</button>
        </form>
        <dl class="totals">
          <dt>Subtotal</dt>
          <dd>{(derived.subtotal / 100).toFixed(2)}€</dd>
          {state.coupon ? <dt class="disc">Coupon {state.coupon}</dt> : null}
          {state.coupon ? <dd class="disc">−{(derived.discount / 100).toFixed(2)}€</dd> : null}
          <dt class="grand">Total</dt>
          <dd class="grand">{(derived.total / 100).toFixed(2)}€</dd>
        </dl>
        {state.lastOrderId ? (
          <p class="order">
            Order confirmed — <a href={`/orders/${state.lastOrderId}`}>{state.lastOrderId}</a>
          </p>
        ) : null}
        <button class="pay" onClick={intents.checkout}>
          Pay
        </button>
      </aside>
    </div>
  ),
});
