---
title: Data cache API — useQuery, mutation, QueryClient
description: "The client cache from janux/query (re-exported by janux/client). Server state lives here; component state stays in schema. Guide: Data cache & URL state."
---

# Data cache API — useQuery, mutation, QueryClient

The client cache from `janux/query` (re-exported by `janux/client`), plus the route cache policy that gives the server half the same vocabulary. Server state lives here; component state stays in `schema`. Guides: [Data cache & URL state](/docs/guide/data-cache) · [HTTP cache & revalidation](/docs/guide/http-cache).

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

`QueryOptions`: `queryKey` (any serializable array), `queryFn`, `staleTime` (ms before a read refetches), `swr` (ms a stale read is still shown for), `gcTime` (ms an unobserved entry survives), `tags` (names `invalidateTag` purges).

### staleTime, swr and expiry

The three states are the same three a route's [`cachePolicy`](#cachepolicydef) declares to a CDN, with the same arithmetic:

| Age | State | What a view sees |
|---|---|---|
| `< staleTime` | fresh | the data; no refetch |
| `< staleTime + swr` | stale | the data, while it revalidates |
| `>= staleTime + swr` | expired | `isPending` again — too old to show |

```ts
const products = useQuery(bag, 'catalog', () => ({
  queryKey: ['catalog', state.tag],
  queryFn: () => fetchCatalog(state.tag),
  staleTime: 30_000,
  swr: 300_000,
  tags: ['catalog'],
}));
```

Without `swr` there is no expiry: stale data is shown indefinitely while it revalidates, which is what every query did before and still does. Expired data is withheld, not deleted — the entry keeps its `updatedAt`, so the refetch it triggers is an ordinary revalidation.

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
| `invalidateTag(tag)` | Refetches every entry carrying `tag` — the same word `revalidateTag` uses on the server |
| `mutate(options, vars)` | Runs a mutation's lifecycle (what `mutation()` wraps) |
| `settle(options?)` | Resolves once nothing is in flight — what SSR awaits before dehydrating. Bounded by `rounds` (waterfall depth, default 10) and `timeoutMs` (default 5s), so a `queryFn` that never settles cannot hold a response open |
| `dehydrate()` | The successful, plain-data entries worth sending to the client |
| `hydrate(entries)` | Restores entries from the payload, resolving anything awaited |
| `expect(hashes)` | Marks entries as arriving on the stream, so observers wait instead of fetching |
| `releaseExpected()` | The response ended: anything still awaited may fetch after all |

`invalidateQueries(['cart'])` matches by prefix, so it also refreshes `['cart', 'summary']`. Failed refetches are swallowed on purpose: invalidation must not reject.

`invalidateTag` is the client half of one invalidation vocabulary — a mutation drops both sides of the cache with the same string:

```ts
await revalidateTag('catalog');                    // server: cached pages + the CDN
await getQueryClient().invalidateTag('catalog');   // client: observed queries
```

`dehydrate()` deliberately drops anything that is not plain schema-shaped data — a `Map`, a `Set`, a `Date`, a class instance — rather than shipping it broken (`JSON.stringify(new Map())` is `{}`, which would arrive as an empty object). Those entries are refetched on the client. See [SSR hydration](/docs/guide/data-cache).

`expect`/`releaseExpected` are what the streamed payload drives; an app does not normally call them.

## getQueryClient()

Returns the ambient client, creating it on first use. `useQuery` prefers `bag.ctx.queryClient` when present (that's how the per-request SSR client is threaded), then falls back to this.

## hashKey(key)

Turns a `QueryKey` into the cache's string hash. **Object keys are sorted**, so `['p', { a: 1, b: 2 }]` and `['p', { b: 2, a: 1 }]` are the same entry — you don't have to normalize your keys by hand.

```ts
hashKey(['catalog', { tag: 'display', page: 1 }]);
```

## cachePolicy(def)

From `janux`. A named, frozen cache policy — a route's `cache` export. Guide: [HTTP cache & revalidation](/docs/guide/http-cache).

```ts
import { cachePolicy } from 'janux';

export const cache = cachePolicy({
  name: 'product-page',
  scope: 'public',
  maxAge: '0s',
  sharedMaxAge: '5m',
  swr: '1h',
  tags: ['catalog', 'product:[id]'],
});
```

| Field | Emits | Default |
|---|---|---|
| `name` | — (identifies the policy) | required |
| `scope` | `public` / `private` | `private` |
| `maxAge` | `max-age` | `0` |
| `sharedMaxAge` | `s-maxage` | `0` — public policies only |
| `swr` | `stale-while-revalidate` | none — public policies only |
| `tags` | the cache-tag header | none |

Durations take the framework grammar (`'30s'`, `'5m'`, `'1h'`) or milliseconds. Tag templates fill `[param]` from the matched route params; a template whose param the request cannot fill is dropped. Declaring `sharedMaxAge` or `swr` on a private policy throws — they would never apply.

A route with no `cache` export answers `private, no-store`.

## cacheHeaders(policy, options?)

From `janux`. The headers a policy is worth, for a custom server or an adapter. `undefined` yields the fail-safe.

```ts
cacheHeaders(undefined);
// { 'cache-control': 'private, no-store' }

cacheHeaders(policy, { params: { id: '42' }, tagHeader: 'Surrogate-Key', vary: ['x-janux-navigation'] });
```

## revalidateTag(tag) · revalidatePath(path)

From `@janux/server`. On-demand revalidation: drops every cached response carrying the tag, or the one at that exact path. Call them wherever the change happens — an `api()` handler, a webhook, a server intent.

```ts
import { revalidatePath, revalidateTag } from '@janux/server';

revalidateTag('product:42');
revalidatePath('/catalog');
```

## createResponseCache(config?)

From `@janux/server`. The shared response cache `createJanuxServer` builds for you — exported for a custom server. It stores only `scope: 'public'`, 200, cookie-free responses, reading its windows from the response's own `Cache-Control`, and stamps `x-janux-cache: HIT | STALE | MISS`.

```ts
const cache = createResponseCache({ tagHeader: 'Cache-Tag', maxEntries: 1000, maxBytes: 2 * 1024 * 1024 });

await cache.handle(req, () => render(req));
```

Related: [HTTP cache & revalidation](/docs/guide/http-cache) · [Data cache & URL state](/docs/guide/data-cache) · [`signal`](/docs/reference/signal) · [Ownership](/docs/reference/owners)
