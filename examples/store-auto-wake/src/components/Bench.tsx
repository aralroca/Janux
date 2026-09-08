import { component, intent, schema, int } from 'janux';
import { score } from '../stores';

/**
 * The mutator. Lazy like everything else: it resumes on your first click,
 * writes the store, and that write is what wakes the scoreboard and banner.
 */
export const Bench = component({
  name: 'bench',
  description: 'Buttons that score goals through the shared store.',
  use: { score },
  intents: {
    goal: intent({
      description: 'Score a goal for one side',
      input: schema({ side: int().min(0).max(1) }),
      run: ({ use, input }) => use.score.intents.goal({ side: input.side }),
    }),
  },
  view: ({ intents }: any) => (
    <section class="bench">
      <button onClick={intents.goal.with({ side: 0 })}>⚽ Goal home</button>
      <button onClick={intents.goal.with({ side: 1 })}>⚽ Goal away</button>
    </section>
  ),
});
