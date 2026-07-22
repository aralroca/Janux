import { component, intent, schema, int } from 'janux';

export const Counter = component({
  name: 'counter',
  description: 'A counter agents can read and operate.',

  state: schema({ count: int() }),

  intents: {
    inc: intent({
      description: 'Increment the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }: any) => (state.count += input.by),
    }),
    dec: intent({
      description: 'Decrement the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }: any) => (state.count -= input.by),
    }),
    reset: intent({
      description: 'Reset to zero. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => (state.count = 0),
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="counter">
      <h1>{state.count}</h1>
      <div class="row">
        <button class="dec" on={intents.dec}>
          −1
        </button>
        <button class="inc" on={intents.inc}>
          +1
        </button>
      </div>
    </section>
  ),
});
