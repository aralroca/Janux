# Data cache & URL state

A cached, filterable product catalog:

- **`useQuery`** binds the list to the client cache, keyed by the active tag. Switching tags switches the observed cache entry (fetch if stale, instant if cached).
- **URL state** — `urlState('tag', str(), 'all', { replace: false })` binds the param to a typed signal: `?tag=…` is deep-linkable, and because each filter pushes a history entry, Back undoes it. A tracked `effect` mirrors the param into `state`, so one source of truth feeds both the view and the agent's resource. Query-only changes are **shallow**: the page never re-renders, the island reacts.
- **SSR caveat** — the server never sees the query string, so a deep link first paints the fallback (`all`) and the island corrects itself on mount.
- **Agent parity** — `catalog.filter { tag: "display" }` from the agent panel drives the exact same intent a click does.
- **Per-request SSR client** keeps server rendering deterministic.
- **`staleTime` + `swr` + `tags`** on the query: fresh for 30s, shown-while-revalidating for 5 more minutes, and dropped by the same tag word the server uses.

## HTTP cache

The other half of the same model — see the [guide](https://janux.build/docs/guide/http-cache).

- **`/catalog`** declares `cachePolicy({ scope: 'public', sharedMaxAge: '1m', swr: '5m', tags: ['catalog'] })`, so it answers with `cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`, a `cache-tag: catalog` for the CDN, and `vary: x-janux-navigation` so a CDN never hands the SPA body to a cold load.
- **`/account`** declares nothing, reads a session cookie, and therefore answers `private, no-store`. That is the default, not a decision anyone had to remember.
- **The panel on `/`** fetches both routes and prints their live headers, then revalidates by tag — `revalidateTag('catalog')` on the server and `invalidateTag('catalog')` on the client, one word for both halves.

```bash
bun install
bun run dev   # http://localhost:4321
```

```bash
curl -sI localhost:4321/catalog | grep -i 'cache\|vary'   # HIT on the second call
curl -sI localhost:4321/account | grep -i cache-control    # private, no-store
```
