import { component, jsx, source } from 'janux';
import { catalog } from '../../server/catalog.api';

/** An island whose SSR source calls the real api() — the mockApi tests bite here. */
const ProductPanel = component({
  name: 'product-panel',
  sources: {
    items: source({ query: async () => ((await catalog()) as { items: string[] }).items }),
  },
  suspense: () => jsx('p', { children: 'loading' }),
  view: ({ sources }: any) => jsx('p', { children: `items:${sources.items.value.join(',')}` }),
});

export default function ProductPage({ params }: { params: { id: string } }) {
  return jsx('section', {
    children: [jsx('h1', { children: `product ${params.id}` }), jsx(ProductPanel as any, {})],
  });
}
