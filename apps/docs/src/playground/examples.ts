export const EXAMPLES: Record<string, string> = {
  Counter: `import { component, intent, schema, int } from 'janux';

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
});`,

  'Cart with guards': `import { component, intent, schema, str, int, money, list } from 'janux';

export const Cart = component({
  name: 'cart',
  description: 'Mini cart. checkout requires human approval.',
  state: schema({ items: list({ id: str(), price: money() }) }),
  derived: { total: (s) => s.items.reduce((a, i) => a + i.price, 0) },
  intents: {
    add: intent({
      description: 'Add an item by id',
      input: schema({ id: str(), price: money().default(999) }),
      run: ({ state, input }) => state.items.push(input),
    }),
    checkout: intent({
      description: 'Pay. Irreversible!',
      guard: 'confirm',
      run: ({ state }) => (state.items = []),
    }),
  },
  view: ({ state, derived, intents }) => (
    <section class="mx-auto mt-10 max-w-sm rounded-2xl border border-slate-200 p-6 font-sans shadow-xl">
      <button on={intents.add} data-input='{"id":"sneakers"}' class="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 font-semibold text-white">
        Add sneakers (9.99)
      </button>
      <ul class="my-4 divide-y divide-slate-100">
        {state.items.map((i, n) => (
          <li key={String(n)} class="py-2 text-slate-700">{i.id} — {(i.price / 100).toFixed(2)}€</li>
        ))}
      </ul>
      <p class="text-lg font-extrabold text-indigo-950">Total: {(derived.total / 100).toFixed(2)}€</p>
      <button on={intents.checkout} class="mt-3 w-full rounded-lg bg-indigo-950 py-2 font-bold text-white">
        Checkout
      </button>
    </section>
  ),
});`,

  'Form intent': `import { component, intent, schema, str, list } from 'janux';

export const Guestbook = component({
  name: 'guestbook',
  description: 'Sign the guestbook.',
  state: schema({ entries: list({ name: str() }) }),
  intents: {
    sign: intent({
      description: 'Add a signature',
      input: schema({ name: str().min(2) }),
      run: ({ state, input }) => state.entries.push({ name: input.name }),
    }),
  },
  view: ({ state, intents }) => (
    <section class="mx-auto mt-10 max-w-sm p-6 font-sans">
      <form intent={intents.sign} class="flex gap-2">
        <input name="name" placeholder="Your name" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500" />
        <button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">
          Sign
        </button>
      </form>
      <ol class="mt-4 list-decimal pl-6 text-slate-700">
        {state.entries.map((e, n) => <li key={String(n)}>{e.name}</li>)}
      </ol>
    </section>
  ),
});`,
};
