import { api, revalidateTag } from '@janux/server';
import { schema, str } from 'janux';
import { PRODUCTS } from './products';

export const listProducts = api({
  description: 'List products, optionally filtered by tag.',
  input: schema({ tag: str().default('all') }),
  run: ({ input }) => (input.tag === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.tag === input.tag)),
});

/**
 * On-demand revalidation, server-side: one word (`catalog`) drops the cached
 * `/catalog` page here and — through the `Cache-Tag` header the policy emits —
 * at the CDN too. The same word the island hands to `invalidateTag`, so both
 * halves of the cache forget the same thing.
 */
export const revalidateCatalog = api({
  description: 'Revalidate every cached response tagged "catalog".',
  run: () => {
    revalidateTag('catalog');

    return { revalidated: 'catalog' };
  },
});
