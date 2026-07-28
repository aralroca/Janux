# Components

Janux has exactly two component kinds. The framework infers which one you wrote.

## Static components (Level 0) — pure HTML, zero JS

A static component is a plain function of props. It renders on the server only and ships **0 KB of JavaScript** — no hydration marker, no runtime.

```tsx
export function PriceTag({ amount }: { amount: number }) {
  return <span class="price">{(amount / 100).toFixed(2)}€</span>;
}
```

A page made only of static components produces an HTML document with zero `<script>` tags. This is the default: interactivity is opt-in.

## Bifacial components — one definition, three projections

A bifacial component declares its state, behavior and view in one place:

```tsx
import { component, intent, schema, str, int, money, list } from 'janux';

export const Cart = component({
  name: 'cart',
  description: 'Shopping cart with line items.',

  state: schema({
    items: list({ productId: str(), qty: int().min(1), unitPrice: money() }),
  }),

  derived: {
    total: (s) => s.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0),
  },

  intents: {
    addItem: intent({
      description: 'Add a product to the cart',
      input: schema({ productId: str(), qty: int().default(1) }),
      run: ({ state, input }) => state.items.push(input),
    }),
  },

  view: ({ state, derived, intents }) => (
    <section>
      {state.items.map((i) => <li key={i.productId}>{i.productId} ×{i.qty}</li>)}
      <button onClick={intents.addItem} data-input='{"productId":"p1"}'>Add</button>
    </section>
  ),
});
```

The three projections, from this single definition:

1. **View** — what renders in the DOM.
2. **Resource** — `ui://cart`: typed state agents read and subscribe to.
3. **Tools** — `cart.addItem`: schema-validated actions agents (and clicks) invoke through the exact same code path.

## Rules the framework enforces

- `state` must be schema-typed (serializable by construction — this powers SSR resume and the agent surface).
- State mutations are only legal inside `run()` bodies (intents, effects, event handlers). Mutating anywhere else throws.
- Views never hold domain state: if the agent should know it, it lives in `state`.

## Using components

Islands mount by using the definition as JSX inside a route: `<Cart />`. Register the definition in `src/client.ts` via `boot({ defs: [Cart] })` so the client can resume it.

## Nested islands (stateful inside stateful)

An island's view can render other islands — stateful components compose to any depth:

```tsx
export const Board = component({
  name: 'board',
  state: schema({ cards: int().default(2) }),
  intents: { add: intent({ run: ({ state }) => (state.cards += 1) }) },
  view: ({ state, intents }) => (
    <section>
      <button onClick={intents.add}>+ card</button>
      {Array.from({ length: state.cards }, (_, i) => <Card key={`c${i}`} />)}
    </section>
  ),
});
```

Semantics:

- **Independent updates.** Each island has its own render loop; a child re-render never touches the parent and vice versa — a live child is an opaque boundary for the parent's morph.
- **Deterministic identity.** A nested island's id is namespaced by its parent (`card#board.default.c0`), identical on the server and on every client re-render, so SSR resume and agent reads target the exact instance.
- **Lifecycle follows the view.** When a parent re-render drops a child (`state.cards -= 1`), the child island is disposed (its `lifecycle.detach` runs); re-adding it later mounts a **fresh** instance with default state. Disposing a parent cascades to all mounted descendants.
- **Agent-visible at every level.** Each nested island is its own resource (`ui://card#board.default.c0`) with its own tools — the copilot operates a card directly, not through the board.

Use `key` when children are conditional or reordered, exactly as you would in any framework.

## Passing data in: props vs. islands

Static components are plain functions, so **prop drilling works exactly as you'd expect** — pass anything down through as many layers as you like; it all runs on the server and disappears from the shipped HTML.

An island is different: its `view` receives the runtime `bag`, not a props object. It accepts only a fixed set of attributes at the call site — `key`/`id` (identity), `initial` (seed its typed state), and the `persist`/`eager` behavior flags:

```tsx
<Cart key="checkout" initial={{ items: [] }} persist />
```

Any *other* attribute is silently ignored — `<Cart discount={0.1} />` compiles but never reaches the island. This is deliberate: an island's only inputs are its schema-typed `state` and the [stores](/docs/guide/stores) and [events](/docs/recipes/cross-island-events) it declares, because those are the JSON-serializable channels that resume and the agent surface depend on. To feed one island from another, share a store or emit an event — not a prop. See [Core API → Island props](/docs/reference/core-api#island-props) for the full table and the type-signature caveat.
