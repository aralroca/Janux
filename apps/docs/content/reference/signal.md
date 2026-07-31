---
title: signal()
description: "The reactive primitive everything else is built on: a mutable cell that tracks who reads it. signal<T>(initial: T): Sig<T>."
---

# signal()

```ts
import { signal } from 'janux';

const count = signal(0);
```

The reactive primitive everything else is built on: a mutable cell that tracks who reads it. `signal<T>(initial: T): Sig<T>`.

| Member | Type | What it does |
|---|---|---|
| `value` | `T` (get/set) | Reading inside a [`watch`](/docs/reference/watch) or [`computed`](/docs/reference/computed) **subscribes** to it. Writing notifies subscribers. |
| `peek()` | `() => T` | Reads without subscribing — the targeted version of [`untrack`](/docs/reference/untrack). |
| `readers()` | `() => number` | Live subscriber count. |

```ts
import { signal, watch } from 'janux';

const count = signal(0);

watch(() => console.log('count is', count.value));   // logs immediately: 0
count.value = 1;                                     // logs: 1
count.peek();                                        // 1 — no subscription created
```

## Writes are deduped by `Object.is`

Assigning the same value notifies nobody, so an idempotent write is free:

```ts
const name = signal('ada');

name.value = 'ada';   // no notification at all
name.value = 'grace'; // notifies
```

`Object.is` semantics mean `NaN` is stable (`NaN → NaN` is *not* a change) while `0` and `-0` are different. Objects compare by identity: mutating a nested field of a signal's object value does **not** notify — assign a new object, or model that state with [`schema`](/docs/reference/schema-api) inside a component, where every field is tracked for you.

## You rarely need this directly

Inside a component or store, `state` is already a fine-grained reactive object and `derived` is already a computed — both built on signals, both projected to agents. Reach for raw signals when you're writing framework-level code: a custom integration, a foreign-runtime bridge, or a helper that must be reactive outside any component.

Component state (preferred — schema-typed, agent-visible, auditable):

```ts
state: schema({ count: int() }),
```

A raw signal (local, invisible to agents, yours to manage):

```ts
const scrollY = signal(0);
```

## `readers()` and ownership

`readers()` exists so an owner can reclaim a signal nobody observes anymore. Subscriptions are removed automatically when the reading effect is disposed — see [ownership](/docs/reference/owners).

Related: [`computed`](/docs/reference/computed) · [`watch`](/docs/reference/watch) · [`batch`](/docs/reference/batch) · [`untrack`](/docs/reference/untrack)
