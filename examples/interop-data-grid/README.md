# Data grid interop — `@tanstack/react-table`

A real headless table library mounted **unchanged** through `foreign()`, with the sort, filter and rows living in Janux state so an agent can drive all three.

- **Callbacks that don't fit `args[0]`** — TanStack hands `on[State]Change` a value **or an updater function**. The short `on: { prop: 'intent' }` form can't carry a function, so this uses the mapped form: `input: ({ args, own }) => …` resolves the updater against the island's own state before the intent ever sees it. This is the example that pushed that shape into `foreign()`.
- **One owner of the truth** — the table is fully controlled: `rows`, `sorting` and `filter` are island state, and the React component holds no state of its own. Clicking a header and calling `grid.sort` go through the *same* intent.
- **The enum is the contract** — `sort` takes `column: 'name' | 'team' | 'score'`, so an agent cannot sort by a column that doesn't exist and get a silent no-op.
- **Guarded reset** — `grid.reset` carries `confirm`: an agent gets a proposal, a human approves.
- **Server-rendered** — a headless table has nothing that needs the DOM, so the whole grid arrives in the HTML before any JS runs.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Watch out: rebuilding controlled state per render

`sorting` is stored in the shape TanStack consumes (`[{ id, desc }]`) and handed over as-is. Rebuilding it in the React file — `state={{ sorting: [{ id: sorting.column, desc: sorting.desc }] }}` — creates a new array on every render, which makes TanStack's auto-reset believe the state changed **every render** and re-render forever. It wedges the main thread; it is not subtle. Give a controlled library the island's own array.

## What this costs

These interop examples ship a second UI runtime, and that is the whole point of measuring it:

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `@tanstack/react-table`) | **312 kB** | **97 kB** |

React is an opt-in, per-island cost: pages with no foreign island still ship none of it. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix) for the same numbers across every category.
