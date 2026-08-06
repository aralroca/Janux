---
title: Keys and lists
description: Keys do two different jobs in Janux, and mixing them up is the source of most "why did my state jump to the wrong row" bugs. This page separates them.
---

# Keys and lists

Keys do two different jobs in Janux, and mixing them up is the source of most "why did my state jump to the wrong row" bugs. This page separates them.

## 1. Keys inside a view: reconciliation

Rendering a list from state? Give each element a `key` so the diff can match nodes across renders instead of rewriting them positionally:

```tsx
view: ({ state }) => (
  <ul>
    {state.items.map((item) => (
      <li key={item.id}>
        {item.name} — {item.qty}
      </li>
    ))}
  </ul>
),
```

Without keys, reordering a list mutates every row in place: focus, scroll position, selection and any DOM state an input holds move to the wrong item. With keys, matched nodes are **moved**, not recreated.

**An element's `id` counts as a key.** The DOM diff matches on `key` first and falls back to the element's `id` — so two siblings sharing an `id` behave like duplicate keys. Keep ids unique, or use `key` explicitly.

Keys must be **stable and unique among siblings**. Array indices are neither when the list can reorder — a deleted first item shifts every key by one, which is exactly the case keys exist to handle.

## 1b. `<For>`: a reactive scope per row

`{state.items.map(…)}` is one expression inside the island's single render
effect. Changing one row re-runs the whole view — every JSX node rebuilt, every
reactive path re-read — and reconciles the whole subtree. That cost does not
depend on how much changed, which is why moving one row of a thousand used to
cost the same as rebuilding all of them.

`<For>` gives every row its **own** reactive scope. The list level only matches
rows by key and moves nodes; a row's body re-runs when that row's data changes,
or when a signal only that row reads changes. (For provable static reads,
including sites inside `map()` callbacks, the compiler writes these fine-grained
bindings automatically — `<For>` is the primitive for everything it cannot
prove. See [Build internals](/docs/reference/build-internals).)

```tsx
import { For } from 'janux';

view: ({ state }) => (
  <ul>
    <For each={state.items} by={(item) => item.id}>
      {(item) => (
        <li>
          {item.name} — {item.qty}
        </li>
      )}
    </For>
  </ul>
),
```

- **`by`, not `key`.** JSX reserves `key` — the transform lifts it out of the
  props object, so a `key` prop would never reach the component.
- **Give it a stable field.** Writing `state.items` stores a defensive clone, so
  the array elements are new objects every time and their identity means
  nothing. `by={(item) => item.id}` is what lets a row survive a list write.
- **Replace a row to update it.** A row re-renders when its item is no longer
  deep-equal to the one it rendered. Mutating the item in place leaves the row
  showing stale data — write `items = items.map((i) => (i.id === id ? { ...i, done } : i))`.
  This is the same contract Solid's `<For>` and React's `memo` have.
- **One node per row.** The body must render exactly one element, and it may not
  contain a nested island or a `foreign()` root — those need the parent's key
  bookkeeping, which a per-row scope cannot supply consistently.
- **`index` is an accessor**, so a row that ignores its position does not
  subscribe to it and a permutation re-renders nothing:
  `{(item, index) => <li>{index()}: {item.name}</li>}`.

On the server `<For>` is an ordinary component that expands to the rows, so the
SSR markup is identical to the `.map()` it replaces; the client reconciler
recognizes it and takes the fine-grained path instead.

Rows still get keyed reconciliation from `by` — you do not add `key` to the row
element as well.

## 2. Keys on islands: instance identity

When the same component appears more than once on a page, each occurrence needs its own identity so state, snapshots and the agent surface stay separate:

```tsx
<Counter key="left" />
<Counter key="right" />
```

That key becomes part of the island's id (`counter#left`) and therefore part of:

- the serialized snapshot the client resumes from,
- the resource URI agents read (`ui://counter#left`),
- the tool name they call (`counter#left.inc`).

Without a key, an island is `counter#default`. Two unkeyed siblings would collide, so **key your islands whenever there can be more than one**.

### What the framework does with your key

- **Sanitized.** Characters outside `[A-Za-z0-9_.-]` become `_`, because the key travels through HTML markers, CSS selectors and id parsing.
- **Deduped.** If two sibling islands still end up with the same key, the second becomes `key~2` and a warning is logged — deterministic, never a silent state merge.
- **Stable across navigation.** A `persist` island is matched by this id when the page swaps, so keep the key stable if you want the instance to survive ([navigation](/docs/guide/navigation)).

## Choosing a key

| Data | Good key |
|---|---|
| Rows from a database | the row id |
| Items in a cart | the product id (or a line id if duplicates are allowed) |
| Fixed layout slots | a literal: `"left"`, `"sidebar"`, `"row-total"` |
| Anything reorderable | never the array index |

## Lists that agents mutate

An agent calling `cart.removeItem { productId }` mutates the same array your view maps over. Because the list is keyed, only the removed row leaves the DOM — the rest keep their nodes, their focus and their scroll. That's also what makes [the glow](/docs/guide/events-and-interactions) legible: the highlight lands on the node that actually changed.

Related: [Views and JSX](/docs/guide/views-and-jsx) · [Nested islands](/docs/guide/components) · [Navigation](/docs/guide/navigation)
