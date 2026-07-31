---
title: untrack()
description: "Runs a function with dependency tracking switched off. untrack<T>(fn: () => T): T — signals read inside fn are not subscribed to."
---

# untrack()

```ts
import { untrack } from 'janux';

watch(() => {
  send(query.value, untrack(() => sessionId.value));   // re-runs on query, never on sessionId
});
```

Runs a function with dependency tracking switched off. `untrack<T>(fn: () => T): T` — signals read inside `fn` are **not** subscribed to.

```ts
import { signal, watch, untrack } from 'janux';

const tracked = signal(0);
const ignored = signal(0);
let runs = 0;

watch(() => {
  tracked.value;
  untrack(() => ignored.value);
  runs += 1;
});

ignored.value = 1;   // runs stays the same
tracked.value = 1;   // runs increments
```

## `untrack` vs `peek()`

They do the same thing at different granularity. Prefer `peek()` for a single read — it's local and obvious; use `untrack` when a whole block (a helper call, a render of foreign content) must not create subscriptions:

```ts
signal.peek();                       // one untracked read
untrack(() => buildReport(state));   // an entire call tree, untracked
```

## When you need it

- **Reading context that shouldn't trigger work** — ids, config, feature flags read alongside the value you actually watch.
- **Avoiding self-triggering loops** — reading a signal you're about to write inside the same effect.
- **Calling into non-reactive code** that happens to read signals as a side effect.

Tracking is restored when `fn` returns, including if it throws — nesting is safe.

Related: [`signal`](/docs/reference/signal) · [`watch`](/docs/reference/watch) · [`batch`](/docs/reference/batch)
