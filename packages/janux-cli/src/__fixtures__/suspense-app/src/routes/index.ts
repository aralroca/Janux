import { component, jsx, source } from 'janux';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Slow on purpose: the boundary is still pending when the page's own HTML completes. */
const LazyPanel = component({
  name: 'lazy-panel',
  sources: {
    rows: source({
      query: async () => {
        await wait(20);

        return ['a', 'b'];
      },
    }),
  },
  suspense: () => jsx('p', { children: 'loading' }),
  view: ({ sources }: any) => jsx('p', { children: `rows:${sources.rows.value.length}` }),
});

/** The page's ONLY island sits behind a suspense boundary. */
export default function Home() {
  return jsx('main', { children: jsx(LazyPanel as any, {}) });
}
