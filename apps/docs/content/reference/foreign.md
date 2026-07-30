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
| `on` | `Record<string, ForeignBinding>` | — | Maps a foreign callback prop to an **intent** on the enclosing island. See [Binding callbacks](#binding-callbacks-to-intents) |
| `hydrate` | `'load' \| 'idle' \| 'visible' \| 'only'` | `'load'` | When the client root mounts |

### Binding callbacks to intents

An `on:` entry takes two forms. The short one is an intent name, and the callback's **first argument** becomes the intent input:

```ts
on: { onBand: 'setBand' }        // onBand({ name, level }) → mixer.setBand({ name, level })
```

That covers callbacks whose first argument already is the payload. Much of the React ecosystem's isn't: TanStack Table hands `on[State]Change` a **value _or_ an updater function**, dnd-kit's `onDragEnd` carries live objects and a native event, and Recharts puts the payload in the *second* argument. The mapped form names the intent and maps the arguments:

```ts
on: {
  onSortingChange: {
    intent: 'sort',
    input: ({ args, own }) => ({ column: resolve(args[0], own.state.sorting)[0]?.id ?? '' }),
  },
  onClick: { intent: 'inspect', input: ({ args }) => ({ index: args[1] }) },
}
```

| Field | Type | What it does |
|---|---|---|
| `intent` | `string` | The intent name on the enclosing island |
| `input` | `({ args, own }) => unknown` | Builds the intent input. `args` is every callback argument; `own` is the JSX call-site props (the shell's `state`), read untracked |

`own` is there because a value-or-updater callback is **unresolvable without the previous value**, and that value lives in the island — not in the callback. Whatever `input` returns is validated against the intent's schema like any other call, so a mapper that returns the wrong shape is a validation error, not a silent no-op.

### Hydrate directives

| Value | Behavior |
|---|---|
| `load` | SSR, then mount as soon as the runtime boots |
| `idle` | SSR, then mount in an idle callback |
| `visible` | SSR, then mount when the host scrolls into view (IntersectionObserver) |
| `only` | **Skip SSR** — client-render only. For components that can't render on the server |

With `react`/`react-dom` installed, everything except `only` server-renders inside its host so the user sees paint before JS. The client then does a deterministic render-replace over that markup rather than a mismatch-prone hydration. SSR here is fail-soft: if the runtime isn't installed, or your `props` mapper or the React render throws, the host ships **empty** and the client mounts it anyway — so a blank host in the HTML means "look at the mapper", not "interop is broken".

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

Related: [Foreign-UI interop](/docs/guide/interop) · [Interop compatibility matrix](/docs/more/interop-matrix) · [Ownership](/docs/reference/owners) · [Examples](/docs/more/examples)
