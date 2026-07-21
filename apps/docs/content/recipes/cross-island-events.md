# Cross-island communication

Three tools, in order of preference: **stores** for shared state, **events** for notifications, the **bridge** for agent-side observation.

## Shared state → stores

If two islands need the same data, that data is a store — not synchronized copies:

```ts
export const Theme = store({
  name: 'theme',
  state: schema({ mode: enums(['light', 'dark']) }),
  intents: { toggle: intent({ run: ({ state }) => (state.mode = state.mode === 'dark' ? 'light' : 'dark') }) },
});

// Any island: use: { theme: Theme } — writes update every reader, fine-grained.
```

## Notifications → events

When islands need to *react* to something happening, not share data:

```ts
// Cart emits (payload is schema-validated):
emits: { 'cart.checkedOut': schema({ orderId: str(), total: money() }) },
run: ({ emit }) => emit('cart.checkedOut', { orderId, total }),

// A Toast island (or any other) listens:
on: {
  'cart.checkedOut': ({ state, event }) => {
    state.message = `Order ${event.orderId} confirmed ✔`;
  },
},
```

One bus per page: component events, store events and (soon) server events all fan out through it. Undeclared events throw at emit time.

## Observation → the bridge

Agents and page-level scripts subscribe without being components:

```ts
window.janux.subscribe('cart.checkedOut', (payload) => { ... });

document.addEventListener('janux:tool-call', ({ detail }) => {
  // { tool, phase } — drive a glow effect over the island the agent is touching
});
```

## Choosing

| Need | Use |
|---|---|
| Two islands render the same value | Store |
| Island B does something when A acts | Event |
| Chrome/copilot reacts to agent activity | `janux:tool-call` DOM event |
| Undo/audit/what-changed | You get it free: every mutation is a named intent |

> **Note:** events don't survive resume — they're notifications, not state. Anything that must survive a reload belongs in `state`.
