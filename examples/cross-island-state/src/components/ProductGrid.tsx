import { batch, component, intent, schema, str } from 'janux';
import { cart } from '../stores';

const PRODUCTS = [
  { id: 'lamp', name: 'Aurora Lamp', price: 3900, art: '💡' },
  { id: 'mug', name: 'Terra Mug', price: 1400, art: '☕' },
  { id: 'chair', name: 'Nimbus Chair', price: 12900, art: '🪑' },
];

/**
 * Island A: writes to the shared store. It never talks to the badge, the panel
 * or the toasts — mutating `use.cart` through its intents is enough, every
 * reader updates.
 */
export const ProductGrid = component({
  name: 'product-grid',
  description: 'Product list that feeds the shared cart store.',
  use: { cart },
  intents: {
    add: intent({
      description: 'Add one product to the shared cart by id',
      input: schema({ id: str() }),
      run: ({ use, input }) => {
        const product = PRODUCTS.find((entry) => entry.id === input.id);

        if (!product) throw new Error(`Unknown product "${input.id}"`);

        return use.cart.intents.add({ id: product.id, name: product.name, unitPrice: product.price });
      },
    }),
    addBundle: intent({
      description: 'Add every product in a single batched update (one repaint)',
      run: ({ use }) =>
        batch(() => {
          PRODUCTS.forEach((product) =>
            use.cart.intents.add({ id: product.id, name: product.name, unitPrice: product.price }),
          );
        }),
    }),
  },
  view: ({ intents }: any) => (
    <section class="product-grid">
      <h2>Products</h2>
      <div class="products">
        {PRODUCTS.map((product) => (
          <article key={product.id} class="product">
            <span class="art">{product.art}</span>
            <h3>{product.name}</h3>
            <p class="price">{(product.price / 100).toFixed(2)}€</p>
            <button onClick={intents.add.with({ id: product.id })}>Add to cart</button>
          </article>
        ))}
      </div>
      <button class="bundle" onClick={intents.addBundle}>
        Add the whole bundle
      </button>
    </section>
  ),
});
