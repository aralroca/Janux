# Data cache & URL state

A cached, filterable product catalog:

- **`useQuery`** binds the list to the client cache, keyed by the active tag. Switching tags switches the observed cache entry (fetch if stale, instant if cached).
- **URL state** — the tag lives in `?tag=…`, deep-linkable and back/forward-correct. Query-only changes are **shallow**: the page never re-renders, the island reacts.
- **Agent parity** — `catalog.filter { tag: "display" }` from the agent panel drives the exact same intent a click does.
- **Per-request SSR client** keeps server rendering deterministic.

```bash
bun install
bun run dev   # http://localhost:3000
```
