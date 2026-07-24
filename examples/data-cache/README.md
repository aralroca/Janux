# Data cache & URL state

A cached, filterable product catalog:

- **`useQuery`** binds the list to the client cache, keyed by the active tag. Switching tags switches the observed cache entry (fetch if stale, instant if cached).
- **URL state** — `urlState('tag', str(), 'all', { replace: false })` binds the param to a typed signal: `?tag=…` is deep-linkable, and because each filter pushes a history entry, Back undoes it. A tracked `effect` mirrors the param into `state`, so one source of truth feeds both the view and the agent's resource. Query-only changes are **shallow**: the page never re-renders, the island reacts.
- **SSR caveat** — the server never sees the query string, so a deep link first paints the fallback (`all`) and the island corrects itself on mount.
- **Agent parity** — `catalog.filter { tag: "display" }` from the agent panel drives the exact same intent a click does.
- **Per-request SSR client** keeps server rendering deterministic.

```bash
bun install
bun run dev   # http://localhost:3000
```
