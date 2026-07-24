import { component, intent, schema, str } from 'janux';
import { useQuery } from 'janux/client';
import { listProducts } from '../server/products.api';

const TAGS = ['all', 'input', 'display', 'video'];

function urlTag(): string {
  if (typeof location === 'undefined') return 'all';

  return new URLSearchParams(location.search).get('tag') ?? 'all';
}

function setUrlTag(tag: string): void {
  if (typeof history === 'undefined') return;
  const params = new URLSearchParams(location.search);

  tag === 'all' ? params.delete('tag') : params.set('tag', tag);
  const q = params.toString();

  history.replaceState({}, '', `${location.pathname}${q ? `?${q}` : ''}`);
}

export const Catalog = component({
  name: 'catalog',
  description: 'A product catalog with a tag filter agents can drive.',
  state: schema({ tag: str().default('all') }),
  lifecycle: { attach: ({ state }: any) => (state.tag = urlTag()) },
  intents: {
    filter: intent({
      description: 'Filter products by tag',
      input: schema({ tag: str() }),
      run: ({ state, input }: any) => {
        state.tag = input.tag;
        setUrlTag(input.tag);
      },
    }),
  },
  view: (bag: any) => {
    const { state, intents } = bag;
    const q = useQuery(bag, 'products', () => ({
      queryKey: ['products', state.tag],
      queryFn: () => listProducts({ tag: state.tag }),
    }));
    const items = q.data.value ?? [];

    return (
      <section class="catalog">
        <div class="tags">
          {TAGS.map((tag) => (
            <button class={state.tag === tag ? 'tag on' : 'tag'} on={intents.filter} data-input={JSON.stringify({ tag })}>
              {tag}
            </button>
          ))}
        </div>
        {q.isPending.value ? <p>Loading…</p> : <ul>{items.map((p: any) => <li class="item">{p.name}</li>)}</ul>}
        <p class="count">total:{items.length}</p>
      </section>
    );
  },
});
