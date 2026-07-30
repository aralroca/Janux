# Interop compatibility matrix

Which parts of the React ecosystem actually mount inside a Janux island, verified by an example that builds and passes end-to-end tests in CI — not by assertion.

Every ✅ row below names a folder in [`examples/`](https://github.com/aralroca/Janux/tree/main/examples) with a dedicated e2e suite. A docs test parses this table and fails if a ✅ row names an example that does not exist or has no suite, so a row cannot claim more than CI proves. Rows marked *not verified* say so on purpose: honesty here is worth more than coverage.

## By category

One example per **category**, not per library — the constraint that keeps this a matrix instead of fifty folders. The library named is the one the example actually mounts.

| Category | Library | Status | SSR | Agent surface | Client JS (gzip) |
|---|---|---|---|---|---|
| Data grid | `@tanstack/react-table` 8.21 | ✅ [`interop-data-grid`](https://github.com/aralroca/Janux/tree/main/examples/interop-data-grid) | ✅ full | `sort`, `filter`, `reset` | 97 kB |
| Hand-written React | — | ✅ [`interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) | ✅ full | `setBand`, `flat` | 83 kB |
| Graph editor | `@xyflow/react` 12.11 | ⚠️ [`with-web-agent`](https://github.com/aralroca/Janux/tree/main/examples/with-web-agent) | ❌ `hydrate: 'only'` | `addStep` | — |

`with-web-agent` mounts React Flow but drives it one way only (island state → React); it has no `on:` bridge back. A dedicated round-trip example is still to come.

## What bit, and what it cost to fix

Two things in `foreign()` were genuinely broken for real libraries. Both were found by writing the failing test first, and both are fixed in the framework rather than worked around in the examples.

### Callbacks whose first argument is not the payload

`on: { onBand: 'setBand' }` forwards the callback's first argument. Much of the ecosystem doesn't fit that shape:

| Library | Callback | What actually arrives |
|---|---|---|
| `@tanstack/react-table` | `onSortingChange(updater)` | a value **or an updater function** |
| `@dnd-kit/core` | `onDragEnd(event)` | live objects plus a native event |
| `recharts` | `onClick(data, index)` | the payload is the **second** argument |

A function is not a valid intent input, and neither is a live DOM object. The [mapped `on:` form](/docs/reference/foreign#binding-callbacks-to-intents) takes every argument plus the island's own state, because resolving a value-or-updater requires the previous value and that lives in the island, not in the callback.

### Portals escape the foreign host

Every a11y-primitive library renders popups into `document.body`, outside the `<janux-foreign>` host the morph treats as an opaque leaf. A navigation removed nodes the React root still owned, and React threw `removeChild: the node to be removed is not a child of this node` on unmount — aborting the teardown midway, so effect cleanups after the portal never ran and a dialog's scroll-lock outlived the page that opened it. React-owned nodes added to `<body>` are now marked runtime-injected, so the morph leaves them alone and React tears down cleanly.

### Referential identity

Reading `state.rows` twice used to return two different objects. React's entire ecosystem memoizes on identity — `useMemo`/`useEffect` deps, `React.memo`, and every data library's internal cache — so "the data changed" was true on every render. State now gives **structural sharing**: a changed subtree gets a new identity all the way up its ancestors, and untouched siblings keep theirs.

## Known limits

These are real and currently unfixed. Each is a limit of the boundary, not a bug in your component.

| Limit | Why |
|---|---|
| Foreign components never appear in the manifest | By design — the framework cannot know someone else's component semantics. Agent capability comes from the wrapping shell. |
| `children` are not forwarded through `foreign()` | A foreign leaf renders from mapped props only. Compositional APIs (`<Dialog.Root><Dialog.Trigger/></Dialog.Root>`) go in a small React file of your own, which is the documented pattern. |
| A throw inside a foreign render escapes into a Janux effect | Only a failure to *start* the root reaches the error reporter. One bad third-party component can take the page down. |
| SSR failure is silent | `renderToString` failures fail soft to an empty host, so a broken `props` mapper and a genuinely unrenderable component look identical. A blank host in the HTML means "look at the mapper". |
| Portals cannot be server-rendered at all | React's server renderer has no portals, so anything portal-based is client-only by nature; say so with `hydrate: 'only'` rather than relying on the silent catch. |
| Reverse interop (a Janux island inside a React app) | Not implemented; on the roadmap. |
| React Server Components | Not supported. `foreign()` mounts a client root. |

## Watch out: controlled state rebuilt per render

The one failure that is *your* code rather than the boundary, and the most expensive to debug, because it wedges the browser's main thread rather than throwing:

```tsx
/** @jsxImportSource react */
// ✗ a new array every render — TanStack's auto-reset fires forever
useReactTable({ state: { sorting: [{ id: sorting.column, desc: sorting.desc }] }, /* … */ });

// ✓ the island's own array, whose identity changes only when the sort does
useReactTable({ state: { sorting }, /* … */ });
```

Store controlled state in the shape the library consumes and hand it over as-is. Janux keeps the identity stable for you; rebuilding it throws that away.

## What interop costs

React interop is opt-in and per-island: an app with no foreign island ships none of this, and the [0 KB default](/docs/guide/architecture-and-roadmap) is unaffected. But these examples ship a second UI runtime, so the number is stated rather than implied.

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| `interop-data-grid` (+ `@tanstack/react-table`) | 312 kB | 97 kB |

Measured from `dist/client` after `janux build`.

Related: [Foreign-UI interop](/docs/guide/interop) · [`foreign()`](/docs/reference/foreign) · [Examples](/docs/more/examples)
