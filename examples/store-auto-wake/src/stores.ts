import { int, intent, schema, store } from 'janux';

/**
 * The shared match score. Nothing on this page is `eager`: the scoreboard and
 * the banner stay inert SSR HTML until the first write to this store — that
 * write marks their markup stale, and the runtime resumes them automatically
 * (see `data-jx-use` on their hosts).
 */
export const score = store({
  name: 'score',
  description: 'Shared match score. The first goal wakes every inert reader.',
  state: schema({ home: int(), away: int() }),
  derived: { total: (state: any) => state.home + state.away },
  intents: {
    goal: intent({
      description: 'Score one goal for a side',
      input: schema({ side: int().min(0).max(1) }),
      run: ({ state, input }) => {
        if (input.side === 0) state.home += 1;
        else state.away += 1;
      },
    }),
  },
});
