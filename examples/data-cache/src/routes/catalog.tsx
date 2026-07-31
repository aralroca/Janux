import { cachePolicy } from 'janux';
import { PRODUCTS } from '../server/products';

export const meta = {
  title: 'Catalog — cacheable at the edge',
  description: 'The same product list, rendered as a page a CDN may keep.',
};

/**
 * The whole point of the page: it is the same catalog, but nothing about it
 * depends on who is asking, so it says so. `maxAge: 0` keeps browsers honest
 * (they revalidate every time) while the CDN — and the server's own shared
 * cache — serve it for a minute and may serve it stale for five more while
 * they refresh it.
 */
export const cache = cachePolicy({
  name: 'catalog-page',
  scope: 'public',
  maxAge: '0s',
  sharedMaxAge: '1m',
  swr: '5m',
  tags: ['catalog'],
});

export default function CatalogPage() {
  return (
    <main class="app">
      <header class="bar">
        <span class="brand">Catalog</span>
        <span class="bar-hint">public · s-maxage=60 · tag: catalog</span>
      </header>
      <ul class="items" id="catalog-items">
        {PRODUCTS.map((product) => (
          <li class="item" key={product.id}>
            {product.name} <small>{product.tag}</small>
          </li>
        ))}
      </ul>
      <p class="count">rendered:{new Date().toISOString()}</p>
      <p>
        <a href="/">← back to the demo</a>
      </p>
    </main>
  );
}
