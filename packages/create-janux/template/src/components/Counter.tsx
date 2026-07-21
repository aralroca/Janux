import { component, intent, schema, int } from 'janux';

export const Counter = component({
  name: 'counter',
  description: 'A counter. Agents can read it (ui://counter) and bump it (counter.inc).',

  state: schema({ n: int() }),

  intents: {
    inc: intent({
      description: 'Increment the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }) => (state.n += input.by),
    }),
    reset: intent({
      description: 'Reset the counter to zero',
      guard: 'confirm',
      run: ({ state }) => (state.n = 0),
    }),
  },

  view: ({ state, intents }) => (
    <section>
      <output>{state.n}</output>
      <button on={intents.inc}>+1</button>
      <button on={intents.reset}>Reset</button>
    </section>
  ),
});
