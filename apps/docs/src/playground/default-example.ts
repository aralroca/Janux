/**
 * The example the playground opens on, in its own module because two very
 * different places need it: the editor loads it as its initial model, and the
 * server paints it into the page so there is code on screen before Monaco has
 * finished downloading. Importing the whole example set for that would put
 * every example in the site's main bundle.
 */
export const DEFAULT_EXAMPLE = `import { component, intent, schema, int } from 'janux';

export const Counter = component({
  name: 'counter',
  description: 'A counter agents can read and operate.',
  state: schema({ count: int() }),
  intents: {
    inc: intent({
      description: 'Increment the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }) => (state.count += input.by),
    }),
    dec: intent({
      description: 'Decrement the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }) => (state.count -= input.by),
    }),
    reset: intent({
      description: 'Reset to zero. Needs human approval.',
      guard: 'confirm',
      run: ({ state }) => (state.count = 0),
    }),
  },
  view: ({ state, intents }) => (
    <section class="flex min-h-screen flex-col items-center justify-center gap-6 font-sans">
      <h1 class="text-6xl font-extrabold text-indigo-950">{state.count}</h1>
      <div class="flex gap-3">
        <button on={intents.dec} class="rounded-xl bg-slate-500 px-7 py-2.5 text-xl font-bold text-white shadow-lg hover:bg-slate-600">
          −1
        </button>
        <button on={intents.inc} class="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-7 py-2.5 text-xl font-bold text-white shadow-lg hover:opacity-90">
          +1
        </button>
      </div>
    </section>
  ),
});`;
