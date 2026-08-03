import { component, intent, schema, str, list } from 'janux';
import { search } from '../server/site.api';

/**
 * The search box and `api.site.search` are the same code: the island's intent
 * calls the server tool an agent calls, so the two surfaces cannot drift.
 */
export const SiteSearch = component({
  name: 'search',
  description: 'Search the published posts — the same tool agents call as api.site.search.',

  state: schema({
    q: str().default(''),
    hits: list({ slug: str(), title: str(), summary: str(), url: str(), markdown: str() }),
  }),

  intents: {
    search: intent({
      description: 'Search posts by keyword.',
      input: schema({ q: str().min(1) }),
      run: async ({ state, input }: any) => {
        const found: any = await search({ q: input.q });

        state.q = input.q;
        state.hits = found.hits;
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="search">
      <form onSubmit={intents.search}>
        <input name="q" placeholder="Search posts…" />
        <button type="submit">Search</button>
      </form>
      {state.q ? (
        <p class="search-count">
          {state.hits.length} result{state.hits.length === 1 ? '' : 's'} for “{state.q}”
        </p>
      ) : null}
      <ul class="search-hits">
        {state.hits.map((entry: any) => (
          <li key={entry.slug}>
            <a href={entry.url}>{entry.title}</a>
            <span>{entry.summary}</span>
            <a class="md-link" href={entry.markdown}>
              .md
            </a>
          </li>
        ))}
      </ul>
    </section>
  ),
});
