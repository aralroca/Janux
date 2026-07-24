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
