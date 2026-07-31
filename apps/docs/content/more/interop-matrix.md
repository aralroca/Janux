---
title: Interop compatibility matrix
description: Which parts of the React ecosystem actually mount inside a Janux island, verified by an example that builds and passes end-to-end tests in CI — not by assertion.
---

# Interop compatibility matrix

Which parts of the React ecosystem actually mount inside a Janux island, verified by an example that builds and passes end-to-end tests in CI — not by assertion.

Every ✅ row below names a folder in [`examples/`](https://github.com/aralroca/Janux/tree/main/examples) with a dedicated e2e suite. A docs test parses this table and fails if a ✅ row names an example that does not exist or has no suite, so a row cannot claim more than CI proves. Rows marked *not verified* say so on purpose: honesty here is worth more than coverage.

## By category

One example per **category**, not per library — the constraint that keeps this a matrix instead of fifty folders. The library named is the one the example actually mounts.

| Category | Library | Status | SSR | Agent surface | Client JS (gzip) |
|---|---|---|---|---|---|
| Data grid | `@tanstack/react-table` 8.21 | ✅ [`interop-data-grid`](https://github.com/aralroca/Janux/tree/main/examples/interop-data-grid) | ✅ full | `sort`, `filter`, `reset` | 97 kB |
| Charts | `recharts` 3.10 | ⚠️ [`interop-charts`](https://github.com/aralroca/Janux/tree/main/examples/interop-charts) | ⚠️ sized box, no SVG | `toggleSeries`, `inspect`, `reset` | 188 kB |
| Virtualization | `@tanstack/react-virtual` 3.14 | ✅ [`interop-virtual-list`](https://github.com/aralroca/Janux/tree/main/examples/interop-virtual-list) | ✅ first window | `select`, `scrollToRow`, `clear` | 91 kB |
| Drag & drop | `@dnd-kit` 6.3 / 10.0 | ✅ [`interop-drag-drop`](https://github.com/aralroca/Janux/tree/main/examples/interop-drag-drop) | ✅ full, a11y intact | `move`, `reset` | 98 kB |
| Command palette | `cmdk` 1.1 | ✅ [`interop-command-palette`](https://github.com/aralroca/Janux/tree/main/examples/interop-command-palette) | ✅ full | `run`, `search`, `clear` | 100 kB |
| Forms | `react-hook-form` 7.83 + `zod` 4 | ⚠️ [`interop-forms`](https://github.com/aralroca/Janux/tree/main/examples/interop-forms) | ✅ full | `fill`, `submit` | 110 kB |
| Graph editor | `@xyflow/react` 12.11 | ✅ [`interop-graph-editor`](https://github.com/aralroca/Janux/tree/main/examples/interop-graph-editor) | ❌ `hydrate: 'only'` | `addNode`, `connect`, `moveNode`, `clear` | 141 kB |
| A11y primitives | `@radix-ui/react-dialog` 1.1 | ✅ [`interop-a11y-primitives`](https://github.com/aralroca/Janux/tree/main/examples/interop-a11y-primitives) | ✅ trigger; portal is client-only | `setOpen`, `remove` | 96 kB |
| Hand-written React | — | ✅ [`interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) | ✅ full | `setBand`, `flat` | 83 kB |
| Graph editor | `@xyflow/react` 12.11 | ⚠️ [`with-web-agent`](https://github.com/aralroca/Janux/tree/main/examples/with-web-agent) | ❌ `hydrate: 'only'` | `addStep` | — |

Recharts 3 computes its layout in effects, so its server render is a correctly sized wrapper with **no SVG inside** — the box is reserved (no layout shift) but the data is not in the HTML. That is Recharts' own behavior: `renderToString` of a bare `<LineChart>` outside Janux produces the same empty wrapper, and the example's e2e suite asserts it so the caveat cannot rot into a claim. The numbers are still server-rendered in the island's `ui://chart` resource, which is the argument for keeping state in the shell rather than inside the foreign component.

**Forms are ⚠️, not ✅, and everything in them works.** react-hook-form keeps its own copy of the form state in uncontrolled inputs — that is why it is fast — so the island is not the single owner, and an agent writing the draft is invisible to a form that never re-reads it. `interop-forms` reconciles the two explicitly and the seam is visible on purpose. If an agent never needs to *write* your form, let RHF own everything and expose `submit` alone; that is ✅ territory.

It also means **validation has two doors**. zod runs on the human path, inside React; an agent calling the intent never reaches it. `interop-forms` had `signup.submit { email: "example" }` accepted until the intent checked the email itself. Whenever a foreign component owns validation, the intent it is bridged to is a second, unvalidated entrance to the same state.

**The graph editor cannot be server-rendered**, because React Flow measures its viewport on mount. `hydrate: 'only'` states that rather than leaning on the silent fail-soft catch, which looks identical to a broken `props` mapper. Nothing is lost for agents: the graph is typed island state, so `ui://graph` is server-rendered and readable even though the canvas is not.

`examples/with-web-agent` also mounts React Flow, one way only (island state → React, no `on:` bridge). `interop-graph-editor` is the round trip.

## What bit, and what it cost to fix

Four things in `foreign()` were genuinely broken for real libraries. Each was found by writing the failing test first, and each is fixed in the framework rather than worked around in the examples.

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

### Libraries that freeze your props

Immer freezes whatever it is handed; Immer is inside Redux Toolkit, and Redux Toolkit is inside Recharts 3 — so "a library deep-freezes your props" is ordinary, not exotic. Freezing a Proxy freezes its *target*, which meant island state became permanently unwritable and every later read threw `'get' on proxy: … the proxy did not return its actual value`.

A foreign component now receives **plain data**, never the live state proxy — on the server and on the client. That also closes the back door where a third-party component could mutate island state directly, behind the intents that are supposed to be the only way in. It is not a copy per render: plain data is cached by the proxy that produced it, and proxies are stable per subtree, so an unchanged 10 000-row list is never re-cloned because a filter string changed.

### Referential identity

Reading `state.rows` twice used to return two different objects. React's entire ecosystem memoizes on identity — `useMemo`/`useEffect` deps, `React.memo`, and every data library's internal cache — so "the data changed" was true on every render. State now gives **structural sharing**: a changed subtree gets a new identity all the way up its ancestors, and untouched siblings keep theirs.

## Verified by hand, not gated in CI

Stated separately because a matrix that quietly counts manual checks as CI coverage is the exact dishonesty this page exists to avoid.

| Thing | Status |
|---|---|
| dnd-kit's **keyboard sensor** (Space / arrows / Space) | Works, and produces the same `move` intent as a pointer drag. Not asserted in CI: the drag commits in stages and moves focus during pickup, and every signal we tried for "the arrow move landed" was itself racy. A flaky gate is worse than an honest gap. |
| `@base-ui-components/react` for a11y primitives | Not verified. It is `1.0.0-rc.0`; pinning CI to a release candidate buys instability rather than coverage. Radix is the library the a11y row actually mounts. |

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

## Watch out: the hosts are unstyled custom elements

`<janux-island>` and `<janux-foreign>` are custom elements with no stylesheet behind them, so they default to `display: inline` and are not boxes until your CSS says so. Any library that **sizes itself to its container** — React Flow, a virtualized scroller, a fluid chart — collapses to zero height inside one, and the failure is silent: the children are in the DOM, positioned, and clipped to nothing.

```css
/* The host has to be a box, and `height: 100%` will not do it when the parent's
   height comes from flex layout rather than a specified `height`. */
.canvas { display: flex; min-height: 420px; }
.canvas janux-foreign { display: block; flex: 1; min-width: 0; }
```

This is a papercut rather than a defect — the framework deliberately ships no global stylesheet — but it costs an afternoon the first time, so it is written down here.

## Watch out: island state is serialized into the HTML

Virtualization is a rendering strategy; it does not make a large state snapshot cheap. 10 000 rows of real data in `state` is a multi-hundred-kilobyte snapshot in **every** response, paid on first paint whether or not the user scrolls. Keep big datasets behind a `source` or an `api()` and let the island hold the window and the cursor — `interop-virtual-list` derives its row labels from the index for exactly this reason.

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
| `interop-virtual-list` (+ `@tanstack/react-virtual`) | 284 kB | 91 kB |
| `interop-drag-drop` (+ `@dnd-kit`) | 305 kB | 98 kB |
| `interop-command-palette` (+ `cmdk`) | 308 kB | 100 kB |
| `interop-a11y-primitives` (+ `@radix-ui/react-dialog`) | 297 kB | 96 kB |
| `interop-forms` (+ `react-hook-form`, `zod`) | 350 kB | 110 kB |
| `interop-graph-editor` (+ `@xyflow/react`) | 435 kB | 141 kB |
| `interop-charts` (+ `recharts`) | 619 kB | 188 kB |

Measured from `dist/client` after `janux build`.

Related: [Foreign-UI interop](/docs/guide/interop) · [`foreign()`](/docs/reference/foreign) · [Design system](/docs/guide/design-system) · [Examples](/docs/more/examples)
