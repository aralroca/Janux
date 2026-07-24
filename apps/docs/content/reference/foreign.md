# foreign() — mount a React component unchanged

```ts
import { foreign, isForeignDef } from 'janux/interop';
```

`foreign(component: unknown, options?: ForeignOptions): ForeignTag` wraps a component from a foreign runtime (React today) so it can be used in a Janux view. The result is TSX-callable like a Janux component, but it mounts a **real embedded root** — full behavioral fidelity for libraries that depend on their own scheduler, portals and synthetic events. Guide: [Foreign-UI interop](/docs/guide/interop).

```tsx
import { foreign } from 'janux/interop';
import { ReactFlow } from '@xyflow/react';

const Flow = foreign(ReactFlow, {
  props: (own) => ({ nodes: own.state.nodes }),
  on: { onNodeDrag: 'moveNode' },
  hydrate: 'visible',
});
```

## ForeignOptions

| Option | Type | Default | What it does |
|---|---|---|---|
| `name` | `string` | the component's `displayName` or `name`, else `'foreign'` | Island name used in ids and markup |
| `props` | `(own) => Record<string, unknown>` | — | Maps the JSX call-site props (typically the shell's `state`) to the foreign component's props. **Tracked**: signal reads re-render only the foreign root |
| `on` | `Record<string, string>` | — | Maps a foreign callback prop to an **intent name** on the enclosing island. The callback's first argument becomes the intent input |
| `hydrate` | `'load' \| 'idle' \| 'visible' \| 'only'` | `'load'` | When the client root mounts |

### Hydrate directives

| Value | Behavior |
|---|---|
| `load` | SSR, then mount as soon as the runtime boots |
| `idle` | SSR, then mount in an idle callback |
| `visible` | SSR, then mount when the host scrolls into view (IntersectionObserver) |
| `only` | **Skip SSR** — client-render only. For components that can't render on the server |

With `react`/`react-dom` installed, everything except `only` server-renders inside its host so the user sees paint before JS. The client then does a deterministic render-replace over that markup rather than a mismatch-prone hydration.

## isForeignDef(type)

`isForeignDef(type: unknown): type is ForeignDef` — the type guard the renderer uses to tell a foreign tag from a Janux component. Import it when you write code that walks a view tree (a custom renderer, a devtool, a test helper) and must branch on the two kinds:

```ts
if (isForeignDef(node.$t)) {
  // an opaque foreign leaf: render its host, don't walk into it
}
```

`ForeignDef` is `{ kind: 'foreign', name, component, options }` and is frozen, so a def can be shared safely across requests.

## Agents see nothing by default

A foreign island projects a **view only** — no resource, no tools. That's deliberate: the framework can't know the semantics of someone else's component. Wrap it in a bifacial shell whose state it renders and whose intents drive it, and the copilot gets full control without DOM inference. The [interop guide](/docs/guide/interop) shows the wrap-once pattern, and [`examples/interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react) is a working app.

Related: [Foreign-UI interop](/docs/guide/interop) · [Ownership](/docs/reference/owners) · [Examples](/docs/more/examples)
