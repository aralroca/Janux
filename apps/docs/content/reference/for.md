---
title: For
description: "The fine-grained list primitive. <For each by> gives every row its own reactive scope, so changing one row updates only that row instead of re-running the whole view."
---

# For

```tsx
import { For } from 'janux';

<For each={state.rows} by={(row) => row.id}>
  {(row) => <li>{row.label}</li>}
</For>;
```

The fine-grained list primitive. `{list.map(…)}` is a single expression inside
the island's one render effect, so touching one row re-runs the whole view and
reconciles the whole subtree — a cost that does not depend on how much changed.
`For` gives every row its own reactive scope: the list level matches rows by key
and moves nodes, and a row's body re-runs only when that row's own data changes,
or when a signal only that row reads changes.

## Props

```ts
interface ForProps<T> {
  each: readonly T[] | (() => readonly T[]) | null | undefined;
  by?: (item: T, index: number) => string | number;
  children: (item: T, index: () => number) => unknown;
}
```

| Prop | Meaning |
|---|---|
| `each` | The list, or a thunk returning it. Read inside the enclosing render scope, so the list level subscribes to the container. |
| `by` | Row identity across renders. Defaults to the item itself. |
| `children` | The row body. Receives the item and an **accessor** for the index. |

## `by`, not `key`

JSX reserves `key`: the transform lifts it out of the props object entirely, so
a `key` prop never reaches a component. `For` spells row identity `by`.

Pass a stable field whenever the list lives in state. A write to `state.rows`
stores a defensive clone, so the array elements are new objects on every read
and their identity means nothing — `by={(row) => row.id}` is what lets a row
survive a list write and be *moved* rather than rebuilt.

## Replace a row to update it

A row re-renders when its item is no longer deep-equal to the one it rendered.
Mutating an item in place leaves the row showing stale data:

```ts
// the row updates
state.rows = state.rows.map((row) => (row.id === id ? { ...row, done: true } : row));

// the row does NOT update
state.rows.find((row) => row.id === id).done = true;
```

This is the contract every identity-keyed list primitive has — Solid's `<For>`
over a plain array and React's `memo` behave the same way.

Rows receive **plain data**, not the state proxy: a row's reactivity to its own
item flows through this diff, and reactivity to anything else flows through the
signals its body reads.

## The index is an accessor

```tsx
<For each={state.rows} by={(row) => row.id}>
  {(row, index) => (
    <li>
      {index()}: {row.label}
    </li>
  )}
</For>
```

Rows that ignore their position — the common case — never subscribe to it, so
permuting the list re-renders nothing.

## Limits

- A row body must render **exactly one node**.
- A row may not contain a nested island or a `foreign()` root. Those need the
  parent's key/sequence bookkeeping, which a per-row scope cannot supply
  consistently across re-renders; `For` throws rather than mounting an island
  whose id would change on every row update.

## On the server

`For` is an ordinary function component that expands to the rows, so SSR markup
is byte-identical to the `.map()` it replaces. The client reconciler recognizes
it before calling it and drives the fine-grained path instead — including
adopting the server's rows on the first client render.

## toRaw

```ts
import { toRaw } from 'janux';

const rows = toRaw(state.rows);
```

The plain value behind a state proxy; anything else passes through unchanged.
`For` uses it to walk a list once per render without registering a tracked path
and building a child proxy for every index. Reach for it when you need to hand
state data to something that must not see the proxy — remember that what you get
back is the live object, so treat it as read-only.

Related: [Keys and lists](/docs/guide/keys-and-lists) · [computed()](/docs/reference/computed) · [watch()](/docs/reference/watch)
