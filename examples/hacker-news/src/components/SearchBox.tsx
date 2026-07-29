import { component, intent, schema, str } from 'janux';
import { useQuery } from 'janux/client';
import type { StorySummary } from '../data/stories';
import { listStories } from '../server/hn.api';

/**
 * The Algolia-style footer search, client-side through the query cache: the
 * whole fixture is fetched once (key `['stories']`) and every search filters
 * it locally. `useQuery` is keyed by (bag, id), so calling it only when there
 * is a query is safe — and it keeps SSR from fetching for an empty box.
 *
 * This island also matters structurally: it is the page's non-suspense island,
 * the reason the streamed front page ships the runtime (see README).
 */
function results(bag: any, query: string): StorySummary[] {
  const q = useQuery(bag, 'stories', () => ({
    queryKey: ['stories'],
    queryFn: () => listStories(),
  }));
  const stories = (q.data.value ?? []) as StorySummary[];

  return stories.filter((story) => story.title.toLowerCase().includes(query));
}

export const SearchBox = component({
  name: 'search-box',
  description: 'Search the stories by title.',
  state: schema({ q: str() }),
  intents: {
    search: intent({
      description: 'Search stories by title',
      input: schema({ q: str() }),
      run: ({ state, input }) => (state.q = input.q),
    }),
  },
  view: (bag: any) => {
    const { state, intents } = bag;
    const query = state.q.trim().toLowerCase();
    const matches = query ? results(bag, query) : [];

    return (
      <div class="search">
        <form class="search-form" onSubmit={intents.search}>
          <input name="q" placeholder="Search stories…" value={state.q} />
          <button type="submit">Search</button>
        </form>
        {query ? (
          <ul class="search-results">
            {matches.map((story) => (
              <li key={String(story.id)}>
                <a href={`/item/${story.id}`}>{story.title}</a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
});
