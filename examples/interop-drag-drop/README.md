# Drag & drop interop — `@dnd-kit`

A sortable board mounted **unchanged** through `foreign()`, with the order living in Janux state — so an agent reorders it without dragging anything.

- **The hardest callback in the matrix** — dnd-kit's `onDragEnd(event)` hands you a live object graph: `active` and `over` carry DOM rects, measuring nodes and a native event. Forwarding `args[0]` raw as an intent input isn't merely wrong, it's **unserializable**. The mapped `on:` form turns a drag into `board.move { id, toIndex }`, reading the drop index against the island's own list.
- **One intent, two callers** — a human drag and `board.move` are the same intent, so the audit trail can't tell them apart except by who invoked it.
- **Server-rendered with its a11y wiring intact** — `aria-roledescription="sortable"`, `role`, `tabindex` and the described-by wiring are all in the HTML. That is what "mounted unchanged" is supposed to mean, and the e2e asserts it.
- **Guarded reset** — `board.reset` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## What CI does and does not gate

The pointer drag, the agent's `board.move`, and the guard are asserted end-to-end in a real Chrome.

dnd-kit's **keyboard sensor** also works — Space picks a card up, arrows move it, Space drops it, and it produces the same `move` intent (verified by hand). It is deliberately **not** gated in CI: dnd-kit's keyboard drag commits in stages and moves focus during pickup, and every deterministic signal we could find for "the arrow move landed" was itself racy. A flaky test that people learn to re-run is worse than an honest gap, so this one is written down rather than asserted.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `@dnd-kit/core`, `/sortable`, `/utilities`) | **305 kB** | **98 kB** |

React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).
