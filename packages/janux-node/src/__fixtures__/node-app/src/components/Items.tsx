import { component, schema, str, list } from 'janux';
import { useQuery } from 'janux/client';
import { listItems } from '../server/catalog.api';

/**
 * An island whose data SSR fetches, so the response has a query payload to
 * carry. Under Node this is what proves the dehydrate/hydrate path is not
 * quietly Bun-only.
 */
export const Items = component({
  name: 'items',
  description: 'Items read through the query cache.',
  state: schema({ ids: list(str()) }),
  view: (bag: any) => {
    const q = useQuery(bag, 'items', () => ({
      queryKey: ['items'],
      queryFn: () => listItems({}),
      staleTime: 60_000,
    }));

    return <p class="items">count:{((q.data.value ?? []) as unknown[]).length}</p>;
  },
});
