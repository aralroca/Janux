import { component, int, intent, schema } from 'janux';

/** An island, so the shell has a reason to emit the client runtime script. */
export const Counter = component({
  name: 'counter',
  description: 'Counts clicks.',
  state: schema({ n: int().default(0) }),
  intents: {
    inc: intent({ description: 'Increment', run: ({ state }: any) => (state.n += 1) }),
  },
  view: ({ state, intents }: any) => <button onClick={intents.inc}>{state.n}</button>,
});
