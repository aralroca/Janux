---
title: Data cache & URL state
description: "The client cache a console leans on: cached reads keyed by reactive values, background revalidation, and mutations with optimistic writes and real rollback."
---

# Data cache & URL state

For the server-state a console leans on — cached reads, background revalidation, mutations with rollback — Janux ships a small client cache (`janux/client`), a signal adapter, persisted stores and typed URL state. It's built on a framework-agnostic core so the same cache works on the server (per-request) and in the browser.

> This is the **client** half of one cache model. The other half — what a CDN may keep, and how to revalidate it by tag — is [HTTP cache & revalidation](/docs/guide/http-cache). Both halves use the same three states (fresh, stale, expired) and the same `tags` vocabulary, on purpose: there is one thing to learn, not two.

## Queries

Inside a component, bind a cached read with `useQuery(bag, id, getOptions)`. It ships with Janux — import it from the client entry:

```ts
import { useQuery } from 'janux/client';
```


```tsx
import { component, intent, schema, str } from 'janux';
import { useQuery } from 'janux/client';
import { listSessions } from '../server/sessions.api';

export const Sessions = component({
  name: 'sessions',
  description: 'Session list with a status filter',
  state: schema({ status: str().default('all') }),
  intents: {
    filter: intent({
      description: 'Filter sessions by status',
      input: schema({ status: str() }),
      run: ({ state, input }) => (state.status = input.status),
    }),
  },
  view: (bag) => {
    const { state } = bag;
    const q = useQuery(bag, 'list', () => ({
      queryKey: ['sessions', state.status],
      queryFn: () => listSessions({ status: state.status }),
    }));

    return q.isPending.value ? (
      <p>Loading…</p>
    ) : (
      <ul>{(q.data.value ?? []).map((row) => <li key={row.id}>{row.name}</li>)}</ul>
    );
  },
});
```

- **Stable per island.** `useQuery(bag, id, …)` returns the *same* handle across re-renders (keyed by the component `bag` and your `id`), so calling it in the view is safe — no re-instantiation.
- **Reactive key.** The getter reads state *inside the query's own effect*; when the key changes the observed cache entry switches — old subscription disposed, new one fetched if stale — and the view re-renders. All of it tears down with the island (ownership scope).
- **`data` / `error` / `isPending` / `isFetching`** are signals; `refetch()` forces a fetch.

### Cache core

`QueryClient` owns the entries: `getQueryData`, `setQueryData`, `invalidateQueries(key)` (prefix match, refetches every matching entry — observed or not), `dehydrate()`/`hydrate()` for SSR. `staleTime` (default 0) controls refetch-on-mount; `gcTime` (default 5 min) reclaims entries with no observers. Keys hash order-independently, so `['s', { a, b }]` and `['s', { b, a }]` are the same entry.

On the server a **fresh `QueryClient` per request** is created automatically (in `ctx.queryClient`), so SSR is deterministic and never bleeds cache between requests. In the browser a single app-wide client is used unless you pass your own.

## Mutations

```tsx
const KEY = ['sessions', 'all'];

const add = mutation({
  mutationFn: (vars) => createSession(vars),
  onMutate: (vars) => {                       // optimistic snapshot
    const previous = client.getQueryData(KEY) ?? [];

    client.setQueryData(KEY, [...previous, vars]);   // data, not an updater function
    return { previous };
  },
  onError: (_e, _vars, ctx) => client.setQueryData(KEY, ctx?.previous ?? []),  // rollback
  onSettled: () => client.invalidateQueries(['sessions']),
});

await add.mutate({ name: 'Ada' });            // add.isPending is a signal
```

`setQueryData` takes the **new value**, not an updater callback — read the current one with `getQueryData` first. It also only writes into an entry that already exists, so the `useQuery` above is what makes the optimistic write land. Full walkthrough: [optimistic UI](/docs/recipes/optimistic-ui).

## Persisted stores

A `store({ persist: 'local' })` rehydrates from storage on mount and writes back on every change:

```tsx
export const prefs = store({
  name: 'prefs',
  persist: 'local',                            // localStorage; SSR-guarded
  state: schema({ theme: str().default('light') }),
  intents: { setTheme: intent({ input: schema({ theme: str() }), run: ({ state, input }) => (state.theme = input.theme) }) },
});
```

For finer control call `persistStore(instance, config)` directly: `{ name, storage, partialize, version, migrate }` over a pluggable `StateStorage` (localStorage default, async-capable). `version`/`migrate` upgrade an older persisted payload; `partialize` persists a subset.

## Typed URL state

`urlState(name, type, fallback)` binds one query-string param to a schema-typed signal — the URL is the source of truth (deep-linkable, back/forward-correct):

```ts
const status = urlState('status', str(), 'all');
status.value.value;          // reads ?status=… (validated), or the fallback
status.set('paid');          // writes ?status=paid; set(fallback) clears it
```

**Query-only changes are shallow.** Updating a query param on the same path never re-renders the page or hits the server — islands read the param reactively through `urlState`, so a filter, tab or dialog change is instant and client-only. Cross-path navigations still get the SPA diff. `urlState` reacts to back/forward via `popstate`.

> The console's filter/tab/modal state (previously a third-party URL-state library) maps directly onto `urlState`; its server-state cache (previously a separate query library) maps onto `useQuery` + `QueryClient`.

## Freshness, and how long stale is still worth showing

`staleTime` says how long the data is fresh; `swr` says how long a stale copy may still be rendered while it revalidates. Past `staleTime + swr` the entry is **expired** and the query reports `isPending` again, rather than paint something too old to be true.

```tsx
const products = useQuery(bag, 'catalog', () => ({
  queryKey: ['catalog', state.tag],
  queryFn: () => listProducts({ tag: state.tag }),
  staleTime: 30_000,   // fresh for 30s
  swr: 300_000,        // shown-while-revalidating for 5 more minutes
  tags: ['catalog'],   // the word that drops it
}));
```

Those are the same two words a route declares to a CDN with [`cachePolicy`](/docs/guide/http-cache), and `tags` is the same vocabulary `revalidateTag` uses on the server — so a mutation drops both halves with one string:

```ts
await revalidateTag('catalog');                    // server: cached pages + the CDN
await getQueryClient().invalidateTag('catalog');   // client: observed queries
```

Without `swr` there is no expiry, which is the default: stale data is shown indefinitely while it refreshes.

A `source` takes the same two options, with the same meaning — a refresh trigger inside `staleTime` is skipped, and past `staleTime + swr` the reader reports `pending` again:

```ts
sources: {
  catalog: source({ query: () => listProducts({}), staleTime: '30s', swr: '5m', refresh: onEvent('inventory.changed') }),
}
```

## SSR hydration: the data comes with the page

A page that renders `useQuery` on the server used to fetch twice — once during
SSR, once again when the island resumed. It does not any more. The per-request
`QueryClient` is dehydrated into the response, and the client resumes on top of
it:

```
1 fetch on the server · 0 on mount
```

Nothing to configure. Two things are worth knowing, because both are visible:

**Freshness still decides.** Hydrated data arrives with the `updatedAt` the
server stamped, so a query that declares no `staleTime` is stale the instant it
lands and refetches — correctly, by its own definition. Declaring freshness is
what turns hydration into zero requests:

```ts
useQuery(bag, 'products', () => ({
  queryKey: ['products', state.tag],
  queryFn: () => listProducts({ tag: state.tag }),
  staleTime: 30_000,   // ← what makes the mount silent
}));
```

**Only plain data travels.** The state invariant is schema-typed plain data, and
the payload holds to it: objects, arrays, strings, finite numbers, booleans and
`null`. An entry holding anything else is **not serialized** — it is left out of
the payload and the client fetches it normally. Nothing is silently mangled on
the way over.

What is left out, and why:

| Value | What JSON would do to it |
|---|---|
| `Map`, `Set` | becomes `{}` — the data replaced by nothing |
| `Date`, class instance | becomes a string / a bare object, never itself again |
| function | dropped from an object, `null` inside an array |
| `Symbol` | same: dropped, or `null` |
| `BigInt` | **throws** — it cannot travel at all |
| `NaN`, `Infinity` | becomes `null` — a different number |
| `undefined` **in an array** | becomes `null` — a different value |

`undefined` as an object *property* is fine: JSON drops the key, and a schema
reads an absent key and an undefined one the same way — so `{ id, nickname:
undefined }` hydrates as `{ id }`.

If you want one of the others hydrated, return it in a schema-expressible shape:
an array of pairs instead of a `Map`, an ISO string instead of a `Date`.

Queries are also left out when they failed, or when they are still running at
the moment the response ends.

### Queries still in flight

If a query has not resolved when the shell goes out — a page with [suspense
boundaries](/docs/guide/ssr-and-resumability) ships its shell early — the chunk
that goes out *announces* it. An island observing that entry renders pending and
waits, instead of starting the request the server is already running; the result
arrives later on the same response and resolves it.

If the response ends without it (a stream that died, a query that never
settled), the client releases the entry and fetches it normally. A broken stream
costs a request, never a spinner that never stops.

### Pages without queries

The payload script is emitted only when there is something to say, so a page
that runs no queries carries not one byte of it.

> **See it running**: [`examples/data-cache`](https://github.com/aralroca/Janux/tree/main/examples/data-cache) — the cached, filterable catalog with typed URL state, a public `/catalog` a CDN may keep, and a panel that revalidates by tag in front of you. More in [Examples](/docs/more/examples).
