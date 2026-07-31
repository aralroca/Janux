---
title: computed()
description: "A read-only signal derived from other signals. computed<T>(fn: () => T): ReadonlySig<T> — fn runs immediately, then re-runs whenever any signal it read changes."
---

# computed()

```ts
import { computed } from 'janux';

const total = computed(() => price.value * qty.value);
```

A read-only signal derived from other signals. `computed<T>(fn: () => T): ReadonlySig<T>` — `fn` runs immediately, then re-runs whenever any signal it read changes.

| Member | Type | What it does |
|---|---|---|
| `value` | `readonly T` | The current derived value. Reading it inside another reactive scope subscribes to it. |
| `peek()` | `() => T` | Reads without subscribing. |
| `dispose()` | `() => void` | Stops recomputation and releases subscriptions. |

```ts
import { signal, computed } from 'janux';

const price = signal(250);
const qty = signal(2);
const total = computed(() => price.value * qty.value);

total.value;      // 500
qty.value = 3;
total.value;      // 750
```

## Dependencies are dynamic

A computed subscribes to exactly the signals it read **on its last run** — branches not taken are not dependencies:

```ts
const useMetric = signal(true);
const metric = signal(10);
const imperial = signal(4);

const shown = computed(() => (useMetric.value ? metric.value : imperial.value));

// While useMetric is true, writing `imperial` recomputes nothing.
imperial.value = 5;   // shown does not re-run
```

## Eager, not lazy

`computed` is implemented as a [`watch`](/docs/reference/watch) writing into a signal: it recomputes when its dependencies change, not when you read it. That makes reads cheap and predictable, and means an expensive computation runs even if nobody reads the result — keep the function pure and cheap, or gate it behind a signal you control.

Call `dispose()` when a computed outlives nothing in particular; inside a component, store or [`createRoot`](/docs/reference/owners) scope, disposal is automatic.

## In components, use `derived`

A component's `derived` map is the same idea with the agent surface attached — values appear in the resource projection agents read:

```ts
derived: { total: (s) => s.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) },
```

Related: [`signal`](/docs/reference/signal) · [`watch`](/docs/reference/watch) · [ownership](/docs/reference/owners)
