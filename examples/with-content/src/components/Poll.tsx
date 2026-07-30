import { component, int, intent, list, obj, schema, str } from 'janux';

/**
 * An ordinary island. Nothing here knows it was mounted from a markdown file:
 * its state is schema-typed, its `vote` intent is on the manifest, and an agent
 * calling the tool takes the same path as a reader clicking a button.
 */
export const Poll = component({
  name: 'poll',
  description: 'A reader poll embedded in a note. Vote for one of the options.',
  state: schema({
    question: str().default('Which one?'),
    options: list(obj({ label: str(), votes: int() })).default([]),
    voted: str().nullable().default(null),
  }),
  derived: {
    total: (state) => state.options.reduce((sum: number, option: any) => sum + option.votes, 0),
  },
  intents: {
    vote: intent({
      description: 'Cast a vote for one of the options',
      // `options()` resolves per instance, so the manifest advertises the
      // choices this note actually wrote instead of a shape agents must guess.
      input: schema({
        option: str().options(({ state }) => state.options.map((choice: any) => choice.label)),
      }),
      run: ({ state, input }) => {
        const option = state.options.find((candidate: any) => candidate.label === input.option);

        if (!option) throw new Error(`No option named "${input.option}"`);
        option.votes += 1;
        state.voted = option.label;
      },
    }),
  },
  view: ({ state, derived, intents }) => (
    <section class="poll">
      <p class="poll-question">{state.question}</p>
      <ul class="poll-options">
        {state.options.map((option: any) => (
          <li key={option.label}>
            <button
              type="button"
              class={state.voted === option.label ? 'poll-option voted' : 'poll-option'}
              onClick={intents.vote.with({ option: option.label })}
            >
              <span>{option.label}</span>
              <span class="poll-count">{option.votes}</span>
            </button>
          </li>
        ))}
      </ul>
      <p class="poll-total">
        {derived.total} {derived.total === 1 ? 'vote' : 'votes'}
      </p>
    </section>
  ),
});
