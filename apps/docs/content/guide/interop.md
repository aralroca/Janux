# Foreign-UI interop (React)

A mature front-end leans on a third-party ecosystem — node-graph editors, animation libraries, data grids, PDF viewers — that doesn't mount on a foreign runtime. `janux/interop` lets you **mount them unchanged**, each in a real embedded React root, while everything around them stays bifacial.

```tsx
import { foreign } from 'janux/interop';
import { ReactFlow } from '@xyflow/react';          // unchanged, third-party

const Flow = foreign(FlowCanvas, {
  props: (own) => ({ nodes: own.state.nodes }),     // Janux state → React props (tracked)
  on: { onMove: 'moveNode' },                       // React callback → island intent
  hydrate: 'visible',                               // load | idle | visible | only
});
```

## Two component kinds, one tree

- **Bifacial island** (`component({...})`) — projects view + resource + intents. Preferred for all new code and anything the agent should drive.
- **Foreign island** (`foreign(ReactComponent, options)`) — an existing React component mounted inside a Janux view. It projects a **view only**: it is *opaque* to agents by default.

## The boundary contract

1. **One real root per island.** `react-dom` `createRoot` per foreign leaf — concurrent scheduling, portals, refs and the synthetic-event contract behave exactly as the library authors assume. The root unmounts when its host leaves the view (and cascades when the enclosing island disposes).
2. **Reactive props bridge.** `options.props(own)` receives the JSX call-site props (typically the enclosing island's `state`) and is **tracked**: signal reads re-render only the foreign root — no Janux DOM diffing crosses the boundary. The host element is an opaque leaf for the morph.
3. **Events → intents.** `options.on` maps a foreign callback prop to an intent NAME on the enclosing island. A drag in a graph editor lands as a typed intent — auditable, guardable, and invocable by the copilot without dragging anything. The callback's first argument becomes the intent input.
4. **SSR + client directives.** When `react`/`react-dom` are installed, the component server-renders inside its host (paint before JS); the client root mounts per `hydrate`: `load` (default), `idle`, `visible` (IntersectionObserver) or `only` (skip SSR). The client performs a deterministic render-replace over the SSR markup — interactions can land before a lazy hydration would finish, so replace beats mismatch races.

Writing React components inside a Janux app: give the file its own runtime with a pragma, everything else is plain React:

```tsx
/** @jsxImportSource react */
export function FlowCanvas({ nodes, onMove }: Props) { /* plain React */ }
```

## Making a foreign island agent-legible (wrap once)

An opaque island is invisible to agents. Wrap it in a bifacial shell whose state it renders and whose intents drive it — the copilot then has full power over it without DOM inference:

```tsx
export const WorkflowEditor = component({
  name: 'workflow-editor',
  state: schema({ nodes: list(nodeSchema) }),
  intents: {
    addNode:  intent({ input: nodeSchema,       run: ({ state, input }) => state.nodes.push(input) }),
    moveNode: intent({ input: moveSchema,       run: ({ state, input }) => { /* … */ } }),
    clear:    intent({ guard: 'confirm',        run: ({ state }) => (state.nodes = []) }),
  },
  view: ({ state }) => <Flow state={state} />,   // the React editor renders the state
});
```

Human gestures update `state` through intents (via `on:`); the agent invokes the *same* intents — every DOM-scraped action becomes a typed tool.


## Two JSX runtimes in one project, step by step

Janux compiles `.tsx` with **its own JSX runtime** by default, while your React components need **React's**. Both coexist per file — the pragma decides:

1. **Install React in your app** (Janux doesn't bundle it): `bun add react react-dom` (+ `bun add -d @types/react @types/react-dom`).
2. **Janux files need nothing**: any `.tsx` without a pragma uses the Janux runtime (components, pages, layouts).
3. **React files start with the pragma** so TypeScript and the compiler use React's runtime for that file only:

```tsx
/** @jsxImportSource react */
import { useState } from 'react';

export function Gauge({ level }: { level: number }) {
  const [open, setOpen] = useState(false);

  return <button onClick={() => setOpen(!open)}>{level}{open ? '!' : ''}</button>;
}
```

4. **Never mix runtimes in one file.** A file is either Janux JSX (`class`, `on={intents.x}`) or React JSX (`className`, `onClick`). Cross the boundary only with `foreign()`.
5. **Mount it** from a Janux view via `foreign()` (see above) — Janux SSRs it, hydrates a real React root, and bridges props/events.
6. **One React, resolved from your app.** The Vite plugin resolves `react`/`react-dom` from your project root and dedupes them, so a linked or nested dependency can never introduce a second React (the classic "invalid hook call" trap). If you see hook errors, check `bun pm ls react` for duplicates.

That's the whole model: Janux owns the tree, React owns its leaves, and each file declares which language it speaks.

## Notes & current limits

- Foreign components never appear in the manifest — by design. Agent capability comes from the wrapping shell.
- A standalone foreign (outside any island) SSRs and mounts from its serialized call-site props; `on:` requires an enclosing island.
- `react`/`react-dom` are optional peers — apps without foreign islands pay nothing.
- Reverse interop (mounting a Janux island inside a React app) is on the roadmap.

> **See it running**: [`examples/interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) — A React component mounted unchanged, with tracked props and callbacks bridged to intents. More in [Examples](/docs/more/examples).
