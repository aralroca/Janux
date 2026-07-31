---
title: Data cache API — useQuery, mutation, QueryClient
description: "The client cache from janux/query (re-exported by janux/client). Server state lives here; component state stays in schema. Guide: Data cache & URL state."
---

# Data cache API — useQuery, mutation, QueryClient

The client cache from `janux/query` (re-exported by `janux/client`). Server state lives here; component state stays in `schema`. Guide: [Data cache & URL state](/docs/guide/data-cache).

```ts
import { useQuery, mutation, QueryClient, getQueryClient, hashKey } from 'janux/query';
```

## useQuery(bag, id, getOptions, client?)

The one you'll use. Inside a component, binds a reactive read to the cache, memoized per bag+`id` so re-renders reuse the same handle.

```ts
const products = useQuery(bag, 'catalog', () => ({
  queryKey: ['catalog', state.tag],
  queryFn: () => fetchCatalog(state.tag),
  staleTime: 30_000,
}));

products.data.value;        // T | undefined
products.isPending.value;   // no data yet
products.isFetching.value;  // a request is in flight (including refetches)
products.error.value;
await products.refetch();
```

`getOptions` is a **getter**: reading signals inside it is how the key becomes reactive. When the key changes, the handle switches to the new cache entry inside one stable effect — the old subscription is disposed, the new one fetched if stale. That's why a `derived` wrapping a `useQuery` has no dependencies and doesn't thrash.

`QueryOptions`: `queryKey` (any serializable array), `queryFn`, `staleTime` (ms before a read refetches), `gcTime` (ms an unobserved entry survives).

## query(options, client?)

The primitive under `useQuery`, without the per-bag memoization. Use it outside a component — in a helper or a foreign bridge — where you own disposal via the [ownership scope](/docs/reference/owners). Same `QueryHandle` shape; `options` may be an object or a getter.

## mutation(options, client?)

```ts
const addItem = mutation({
  mutationFn: (vars: { id: string }) => post('/api/cart', vars),
  onMutate: (vars) => optimisticallyAdd(vars),        // returns ctx
  onError: (error, vars, ctx) => rollback(ctx),
  onSuccess: (data, vars, ctx) => toast('Added'),
  onSettled: () => getQueryClient().invalidateQueries(['cart']),
});

await addItem.mutate({ id: 'sku-1' });
addItem.isPending.value;
```

The four callbacks run in that order; whatever `onMutate` returns is handed to `onError`/`onSuccess` as `ctx`, which is the optimistic-update pattern with rollback.

## QueryClient

One cache instance. The client runtime creates it; SSR gets a fresh one **per request**, so server rendering never leaks data between users.

| Method | What it does |
|---|---|
| `getQuery(options)` | The cache entry for `options.queryKey`, created if absent |
| `getQueryData(key)` | Current data for a key, or `undefined` |
| `setQueryData(key, data)` | Writes data directly (optimistic updates) |
| `invalidateQueries(key?)` | Refetches everything matching the key **prefix** — no key means all |
| `mutate(options, vars)` | Runs a mutation's lifecycle (what `mutation()` wraps) |
| `dehydrate()` | Serializable snapshot of every entry — for SSR handoff |
| `hydrate(entries)` | Restores a snapshot on the client |

`invalidateQueries(['cart'])` matches by prefix, so it also refreshes `['cart', 'summary']`. Failed refetches are swallowed on purpose: invalidation must not reject.

## getQueryClient()

Returns the ambient client, creating it on first use. `useQuery` prefers `bag.ctx.queryClient` when present (that's how the per-request SSR client is threaded), then falls back to this.

## hashKey(key)

Turns a `QueryKey` into the cache's string hash. **Object keys are sorted**, so `['p', { a: 1, b: 2 }]` and `['p', { b: 2, a: 1 }]` are the same entry — you don't have to normalize your keys by hand.

```ts
hashKey(['catalog', { tag: 'display', page: 1 }]);
```

Related: [Data cache & URL state](/docs/guide/data-cache) · [`signal`](/docs/reference/signal) · [Ownership](/docs/reference/owners)
