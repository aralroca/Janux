import { component } from 'janux';
import { cart } from '../stores';

/**
 * Island B: a pure reader in the header. `use: { cart: Cart }` is the whole
 * wiring — no provider, no hook, no prop drilling across the page.
 */
export const CartBadge = component({
  name: 'cart-badge',
  description: 'Header badge showing how many items the shared cart holds.',
  use: { cart },
  view: ({ use }: any) => (
    <span class="cart-badge">
      🛒 <output>{use.cart.derived.count}</output> items
    </span>
  ),
});
