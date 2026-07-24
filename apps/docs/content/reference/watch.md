# watch()

```ts
import { watch } from 'janux';

const dispose = watch(() => document.title = `${count.value} items`);
```

Runs a function now and again whenever any signal it read changes. `watch(fn: () => void | (() => void)): () => void` — the return value is a **dispose** function.

> **Note:** `watch` is the signal-level effect. The `effect` exported from `janux` is something else — the [component effect factory](/docs/guide/sources-effects-events) that declares an effect inside a `component({...})` definition. The primitive is aliased to `watch` precisely so the two never collide in an import list.

```ts
import { signal, watch } from 'janux';

const query = signal('');
const dispose = watch(() => console.log('searching', query.value));   // runs immediately

query.value = 'janux';   // runs again
dispose();
query.value = 'ignored'; // never runs again
```

## Returning a cleanup

If `fn` returns a function, it runs before the next re-run and on dispose — the place for listeners, timers and subscriptions:

```ts
watch(() => {
  const id = setInterval(() => poll(url.value), 1000);

  return () => clearInterval(id);
});
```

## Guarantees worth knowing

- **Dynamic dependencies.** Subscriptions are rebuilt on every run, so a branch not taken is not a dependency.
- **No zombies.** An effect disposed while a notification is in flight never re-runs and never re-subscribes.
- **Stable ownership.** Re-runs execute under the owner that *created* the effect, so [`onCleanup`](/docs/reference/owners) inside `fn` always registers in the right scope — even when the write came from somewhere else entirely.
- **Idempotent dispose.** Calling the returned function twice is safe.

## In components, use `effect({...})`

Inside a component or store, declare effects in the definition instead: they get schema-typed state, a lifecycle bound to the island, `settled()` support and — unlike a raw `watch` — they're visible in the manifest as behavior an agent can reason about.

```ts
effects: {
  persistCart: effect({ when: (s) => s.items, debounce: '300ms', run: ({ state }) => save(state) }),
},
```

Related: [`signal`](/docs/reference/signal) · [`computed`](/docs/reference/computed) · [`batch`](/docs/reference/batch) · [ownership](/docs/reference/owners)
