# Data cache & URL state

For the server-state a console leans on — cached reads, background revalidation, mutations with rollback — Janux ships a small client cache (`janux/client`), a signal adapter, persisted stores and typed URL state. It's built on a framework-agnostic core so the same cache works on the server (per-request) and in the browser.

## Queries

Inside a component, bind a cached read with `useQuery(bag, id, getOptions)`:

```tsx
export const Sessions = component({
  name: 'sessions',
  state: schema({ status: str().default('all') }),
  intents: {
    filter: intent({
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

    return q.isPending.value ? <Spinner /> : <Rows items={q.data.value ?? []} />;
  },
});
```

- **Stable per island.** `useQuery(bag, id, …)` returns the *same* handle across re-renders (keyed by the component `bag` and your `id`), so calling it in the view is safe — no re-instantiation.
- **Reactive key.** The getter reads state *inside the query's own effect*; when the key changes the observed cache entry switches — old subscription disposed, new one fetched if stale — and the view re-renders. All of it tears down with the island (ownership scope).
- **`data` / `error` / `isPending` / `isFetching`** are signals; `refetch()` forces a fetch.

### Cache core

`QueryClient` owns the entries: `getQueryData`, `setQueryData`, `invalidateQueries(key)` (prefix match, refetches observed entries), `dehydrate()`/`hydrate()` for SSR. `staleTime` (default 0) controls refetch-on-mount; `gcTime` (default 5 min) reclaims entries with no observers. Keys hash order-independently, so `['s', { a, b }]` and `['s', { b, a }]` are the same entry.

On the server a **fresh `QueryClient` per request** is created automatically (in `ctx.queryClient`), so SSR is deterministic and never bleeds cache between requests. In the browser a single app-wide client is used unless you pass your own.

## Mutations

```tsx
const add = mutation({
  mutationFn: (vars) => createSession(vars),
  onMutate: (vars) => {                       // optimistic snapshot
    const previous = client.getQueryData(['sessions', 'all']);
    client.setQueryData(['sessions', 'all'], (old) => [...old, vars]);
    return { previous };
  },
  onError: (_e, _vars, ctx) => client.setQueryData(['sessions', 'all'], ctx.previous),  // rollback
  onSuccess: () => client.invalidateQueries(['sessions']),
});

await add.mutate({ name: 'Ada' });            // add.isPending is a signal
```

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
