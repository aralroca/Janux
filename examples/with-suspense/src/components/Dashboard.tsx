import { component, int, intent, schema, source } from 'janux';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deliberately slow (1.5s): the skeleton streams first, the data swaps in. */
export const SlowStats = component({
  name: 'slow-stats',
  description: 'Store stats, loaded from a deliberately slow source.',
  sources: {
    stats: source({
      query: async () => {
        await delay(1500);

        return [
          { label: 'Orders', value: 128 },
          { label: 'Revenue', value: '4.2k€' },
          { label: 'Refunds', value: 3 },
        ];
      },
    }),
  },
  suspense: () => (
    <div class="stats">
      {[1, 2, 3].map((n) => (
        <div class="stat skeleton" key={String(n)}>
          <span class="stat-value">···</span>
          <span class="stat-label">loading</span>
        </div>
      ))}
    </div>
  ),
  view: ({ sources }: any) => (
    <div class="stats">
      {sources.stats.value.map((stat: any) => (
        <div class="stat" key={stat.label}>
          <span class="stat-value">{stat.value}</span>
          <span class="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  ),
});

/** Even slower (2.5s): swaps independently of the stats above it. */
export const SlowNews = component({
  name: 'slow-news',
  description: 'News feed, loaded from an even slower source.',
  sources: {
    news: source({
      query: async () => {
        await delay(2500);

        return ['Streaming SSR shipped', 'Suspense boundaries landed', 'Diffing stays intact'];
      },
    }),
  },
  suspense: () => (
    <ul class="news">
      {[1, 2].map((n) => (
        <li class="skeleton skeleton-line" key={String(n)}>
          loading…
        </li>
      ))}
    </ul>
  ),
  view: ({ sources }: any) => (
    <ul class="news">
      {sources.news.value.map((headline: string) => (
        <li key={headline}>{headline}</li>
      ))}
    </ul>
  ),
});

/**
 * Painted with the first flush; on SPA navigations it is interactive while the
 * slow islands are still pending (listeners install as the stream paints).
 */
export const Counter = component({
  name: 'counter',
  description: 'A counter rendered alongside the slow islands.',
  state: schema({ n: int() }),
  intents: {
    inc: intent({ description: 'Increment', run: ({ state }) => (state.n += 1) }),
  },
  view: ({ state, intents }: any) => (
    <button class="counter" onClick={intents.inc}>
      clicks: {state.n}
    </button>
  ),
});
