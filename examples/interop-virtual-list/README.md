# Virtualization interop — `@tanstack/react-virtual`

10 000 rows, mounted **unchanged** through `foreign()`, with the selection and the scroll request living in Janux state.

- **It server-renders** — a virtualizer measures the DOM, which the server doesn't have, so the usual outcome is a client-only empty box. `initialRect` avoids that: the first window arrives in the HTML at the correct total scroll height (320 000px), so the scrollbar is honest before any JS runs.
- **The agent scrolls a list it cannot see** — row 5 000 is not in the DOM, so no amount of DOM scraping reaches it. `list.scrollToRow` writes an index to island state and the virtualizer obeys. This is the clearest case in the matrix for why an intent beats a synthetic click.
- **Selection is Janux state** — a row click and `list.select` are the same intent, and the selection is readable in the `ui://list` resource.
- **Guarded clear** — `list.clear` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Why the row data is derived, not stored

The row labels are computed from the index rather than kept in `state`. That is a deliberate demonstration of a real constraint: **island state is serialized into the HTML**, so 10 000 rows of real data would be a multi-hundred-kilobyte snapshot in every response — paid on first paint, whether or not the user scrolls.

Big datasets belong behind a `source` or an `api()`, with the island holding the window and the cursor. Virtualization is a *rendering* strategy; it does not make a large state snapshot cheap.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `@tanstack/react-virtual`) | **284 kB** | **91 kB** |

The virtualizer itself is tiny — nearly all of it is React. React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).
