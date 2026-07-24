# Data cache & URL state

For the server-state a console leans on — cached reads, background revalidation, mutations with rollback — Janux ships a small client cache (`janux/client`), a signal adapter, persisted stores and typed URL state. It's built on a framework-agnostic core so the same cache works on the server (per-request) and in the browser.

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

> **See it running**: [`examples/data-cache`](https://github.com/aralroca/Janux/tree/main/examples/data-cache) — the cached, filterable catalog with typed URL state. More in [Examples](/docs/more/examples).
