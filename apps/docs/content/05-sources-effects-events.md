# Sources, effects and events

React puts all of this in `useEffect`, opaquely. Janux separates data-in, side-effects-out and communication — as declared, named sections that agents can see and the runtime can await.

## Sources — declarative async data-in

```tsx
sources: {
  catalog: source({
    description: 'Product catalog',
    query: () => catalog({}),                       // an api() — callable on both sides
    refresh: every('5m').orOn('inventory.changed'), // pull + push, declared as data
  }),
},
```

Each source exposes `.value`, `.pending` and `.error` to the view and the manifest. On SSR, sources load before rendering, so the HTML arrives complete. `onEvent('x')` declares event-only refresh.

## Effects — named side effects with declared triggers

```tsx
effects: {
  persist: effect({
    description: 'Syncs the cart to the server',
    when: (s) => s.items,        // the state slice that triggers it — no deps array
    debounce: '300ms',
    run: ({ state }) => saveCart({ items: state.items }),
  }),
},
```

- Effects run on attach and whenever their `when` slice changes (debounced if declared).
- `run` may return a cleanup function (called before re-run and on dispose), or a Promise (tracked by `settled()`).
- Durations are strings: `300ms`, `2s`, `5m`, `1h`.

## Events — one bus, two audiences

```tsx
emits: { 'cart.checkedOut': schema({ orderId: str(), total: money() }) },
on:    { 'auth.loggedOut': ({ intents }) => intents.clear({}) },
```

`emit('cart.checkedOut', payload)` validates the payload against the declared schema, then fans out to every component `on:` handler and to agent subscriptions (`window.janux.subscribe`). Undeclared events throw.

## Quiescence: `settled()`

Because every async thing is declared (source loads, effect runs, debounce timers, delegated intent invocations), the runtime can answer "are you done?":

```ts
await window.janux.call('cart.addItem', { productId: 'p1' });
await window.janux.settled();          // resolves when nothing is in flight
await window.janux.settled('ui://cart'); // scoped variant
```

This kills the `sleep(500)` idiom in agent automation and E2E tests: quiescence is observable, not guessed.
