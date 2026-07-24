# createBus

```ts
import { createBus } from 'janux';

const bus = createBus();
const off = bus.on('cart.cleared', (payload) => console.log(payload));

bus.emit('cart.cleared', { at: Date.now() });
off();
```

`createBus(): EventBus` — the event channel that connects components, stores and the server. One bus per client (or per test); the runtime creates and wires it for you.

| Method | Signature | Notes |
|---|---|---|
| `emit` | `(event: string, payload: unknown) => void` | Synchronous: handlers run in registration order before `emit` returns. |
| `on` | `(event: string, handler: BusHandler) => () => void` | Returns an **unsubscribe** function. |

## What travels on it

- **Component `emits`** — declared in a definition, emitted from an intent's `run` via `emit('cart.cleared', {...})`.
- **Store events** — a store's `on: { 'cart.cleared': ... }` handlers subscribe here, which is how one island reacts to another without importing it.
- **Source refreshes** — an [`every(...).orOn('inventory.changed')`](/docs/reference/every) policy listens on this bus.

Events are plain strings by convention `noun.verb`, and payloads are schema-validated at the component boundary — the bus itself is deliberately dumb.

## When to create one yourself

Only in tests and custom embeddings, where you need two instances to share a channel:

```ts
import { createBus, createInstance } from 'janux';

const bus = createBus();
const cart = createInstance(Cart, { bus });
const analytics = createInstance(Analytics, { bus });

await cart.intents.clear({});
analytics.snapshot().clears;   // 1 — the store saw the event
```

An unsubscribed handler is removed immediately; a handler that throws propagates to the `emit` caller (nothing is swallowed).

Related: [Cross-island events](/docs/recipes/cross-island-events) · [Stores](/docs/guide/stores) · [Sources, effects and events](/docs/guide/sources-effects-events)
