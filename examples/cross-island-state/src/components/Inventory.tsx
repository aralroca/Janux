import { component, onEvent, source } from 'janux';
import { checkInventory } from '../server/inventory.api';

/**
 * Island E: `onEvent` as a refresh policy. The source resolves during SSR, and
 * on the client it re-queries the server strictly when `cart.itemAdded` fires
 * on the page bus — no timer, no polling.
 */
export const Inventory = component({
  name: 'inventory',
  description: 'Server stock checks, re-queried on every cart.itemAdded event.',
  sources: {
    status: source({
      description: 'Inventory status from the server',
      query: () => checkInventory({}),
      refresh: onEvent('cart.itemAdded'),
    }),
  },
  view: ({ sources }: any) => (
    <aside class="inventory">
      <h2>Inventory</h2>
      {sources.status.value ? (
        <p>
          Stock checked <output>{sources.status.value.checks}</output> times
        </p>
      ) : (
        <p>Checking stock…</p>
      )}
    </aside>
  ),
});
