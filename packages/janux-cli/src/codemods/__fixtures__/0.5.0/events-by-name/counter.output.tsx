// @file: src/components/Counter.tsx
import { component, int, intent, schema } from 'janux';

export const Counter = component({
  name: 'counter',
  state: schema({ count: int() }),
  intents: {
    add: intent({ description: 'Increment', run: ({ state }) => (state.count += 1) }),
    setTo: intent({ description: 'Set the count', input: schema({ value: int() }), run: () => {} }),
    save: intent({ description: 'Save the count', run: () => {} }),
  },
  view: ({ state, intents }: any) => (
    <div class="counter">
      <output>{state.count}</output>
      {/* The click binding, with the input the element carries. */}
      <button onClick={intents.add}>+1</button>
      <button onClick={intents.setTo} data-input={JSON.stringify({ value: 0 })}>
        reset
      </button>
      <button onClick={intents.setTo.with({ value: 10 })}>ten</button>
      <form onSubmit={intents.save} reset>
        <input name="note" />
      </form>
    </div>
  ),
});
