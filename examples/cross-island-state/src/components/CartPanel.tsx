import { component, intent, schema, str } from 'janux';
import { cart } from '../stores';

/**
 * Repaint counter for the batch() demo: the view re-runs once per flush, so
 * "Add the whole bundle" (three adds, one batch) moves `data-paints` exactly
 * as much as a single add. Server and client each count their own module copy.
 */
let paints = 0;

/** Island C: lists the shared cart and mutates it through the store's intents. */
export const CartPanel = component({
  name: 'cart-panel',
  description: 'Cart line items and totals, driven entirely by the shared store.',
  use: { cart },
  intents: {
    remove: intent({
      description: 'Remove a product line from the cart',
      input: schema({ id: str() }),
      run: ({ use, input }) => use.cart.intents.remove({ id: input.id }),
    }),
    clear: intent({
      description: 'Empty the cart',
      run: ({ use }) => use.cart.intents.clear({}),
    }),
  },
  view: ({ use, intents }: any) => {
    paints += 1;

    return (
      <aside class="cart-panel" data-paints={String(paints)}>
        <h2>Cart</h2>
        {use.cart.state.items.length === 0 ? <p class="empty">Your cart is empty.</p> : null}
        <ul class="lines">
          {use.cart.state.items.map((item: any) => (
            <li key={item.id}>
              <span class="name">{item.name}</span>
              <span class="qty">×{item.qty}</span>
              <span class="price">{((item.qty * item.unitPrice) / 100).toFixed(2)}€</span>
              <button class="x" onClick={intents.remove.with({ id: item.id })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <p class="total">
          Total <output>{(use.cart.derived.total / 100).toFixed(2)}€</output>
        </p>
        <button class="clear" onClick={intents.clear}>
          Clear cart
        </button>
      </aside>
    );
  },
});
