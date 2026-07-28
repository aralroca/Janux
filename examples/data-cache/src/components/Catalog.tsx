import { component, effect, intent, schema, str } from 'janux';
import { urlState, useQuery, type UrlStateHandle } from 'janux/client';
import { listProducts } from '../server/products.api';

const TAGS = ['all', 'input', 'display', 'video'];

/**
 * One binding per island: `urlState` owns a signal and a popstate listener, so
 * it is created once and keyed by the island's state (stable across renders and
 * intent calls) — the same shape `useQuery` uses for its handle.
 */
const tagHandles = new WeakMap<object, UrlStateHandle<string>>();

function tagParam(state: object): UrlStateHandle<string> {
  const existing = tagHandles.get(state);

  if (existing) return existing;
  // `replace: false` makes each filter a history entry, so Back undoes it —
  // the default (`true`) keeps filters out of history instead.
  const handle = urlState('tag', str(), 'all', { replace: false });

  tagHandles.set(state, handle);

  return handle;
}

export const Catalog = component({
  name: 'catalog',
  description: 'A product catalog with a tag filter agents can drive.',
  state: schema({ tag: str().default('all') }),
  effects: {
    // `when` is tracked, so reading the URL signal here is what makes deep links
    // and the back button flow into state — no manual popstate wiring.
    followUrl: effect({
      description: 'Mirrors the ?tag= param into state',
      when: (state: any) => tagParam(state).value.value,
      run: ({ state }: any) => (state.tag = tagParam(state).value.value),
    }),
  },
  intents: {
    filter: intent({
      description: 'Filter products by tag',
      input: schema({ tag: str() }),
      run: ({ state, input }: any) => {
        state.tag = input.tag;
        tagParam(state).set(input.tag);
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
            <button class={state.tag === tag ? 'tag on' : 'tag'} onClick={intents.filter} data-input={JSON.stringify({ tag })}>
              {tag}
            </button>
          ))}
        </div>
        {q.isPending.value ? <p>Loading…</p> : <ul>{items.map((product: any) => <li class="item">{product.name}</li>)}</ul>}
        <p class="count">total:{items.length}</p>
      </section>
    );
  },
});
