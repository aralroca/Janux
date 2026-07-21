export const EXAMPLES: Record<string, string> = {
  Counter: `import { component, intent, schema, int } from 'janux';

const btn = 'font-size:20px;padding:10px 26px;margin:14px 6px 0;border:none;' +
  'border-radius:12px;color:#fff;cursor:pointer;font-weight:700;' +
  'box-shadow:0 6px 18px -6px rgba(30,27,75,.4)';

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
    <section style="font-family:sans-serif;text-align:center;padding-top:40px">
      <h1 style="font-size:56px;margin:0;color:#1e1b4b">{state.count}</h1>
      <button on={intents.dec} style={btn + ';background:#64748b'}>−1</button>
      <button on={intents.inc} style={btn + ';background:linear-gradient(90deg,#7c3aed,#06b6d4)'}>+1</button>
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
    <section style="font-family:sans-serif;padding:24px">
      <button on={intents.add} data-input='{"id":"sneakers"}'>Add sneakers (9.99)</button>
      <ul>{state.items.map((i, n) => <li key={String(n)}>{i.id} — {(i.price / 100).toFixed(2)}€</li>)}</ul>
      <p><strong>Total: {(derived.total / 100).toFixed(2)}€</strong></p>
      <button on={intents.checkout}>Checkout</button>
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
    <section style="font-family:sans-serif;padding:24px">
      <form intent={intents.sign}>
        <input name="name" placeholder="Your name" />
        <button type="submit">Sign</button>
      </form>
      <ol>{state.entries.map((e, n) => <li key={String(n)}>{e.name}</li>)}</ol>
    </section>
  ),
});`,
};
