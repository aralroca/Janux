# Graph editor interop — `@xyflow/react`

A node-graph editor mounted **unchanged** through `foreign()`, driven in **both** directions.

- **The round trip `with-web-agent` doesn't have** — that example mounts React Flow one way: island state flows in, nothing comes back. Here a node drag lands as `graph.moveNode` and an edge drawn by hand lands as `graph.connect`, which are the same tools the agent calls.
- **The payload is the second argument, again** — `onNodeDragStop(event, node)`, and the node it carries is a live React Flow object rather than JSON. The mapped `on:` form picks the id and the rounded position out of it.
- **The graph is state, the canvas is a view of it** — nodes and edges are typed island state, so `ui://graph` is readable by an agent even though the canvas itself is not.
- **Guarded clear** — `graph.clear` carries `confirm`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Why `hydrate: 'only'`

React Flow measures its viewport on mount, and the server has none — server-rendering it would produce a zero-sized canvas that has to be thrown away. `hydrate: 'only'` says that out loud instead of leaning on the boundary's silent fail-soft catch, which would look identical to a broken `props` mapper.

Nothing is lost for agents: the island's own view — `3 nodes · 1 edges`, the edge list — is server-rendered, and the graph is in the `ui://graph` resource. What is client-only is the *canvas*, not the data.

## What this costs

| Build | Client JS (raw) | gzip |
|---|---|---|
| A Janux app with no foreign island (`with-tailwind`) | 69 kB | 24 kB |
| `interop-react` (React + react-dom) | 259 kB | 83 kB |
| **this app** (+ `@xyflow/react`) | **435 kB** | **141 kB** |

React interop is opt-in and per-island. See the [interop compatibility matrix](https://janux.build/docs/more/interop-matrix).
