# HTTP cache & revalidation

A page that renders in 3 ms on your laptop and takes 300 ms from Sydney is not a
fast page. The distance is the CDN's job — but a CDN can only keep what your
app tells it it may keep, and getting that wrong is not a slow site, it is one
visitor's session served to everybody else.

So Janux makes cacheability a **declaration**, in the same place and the same
shape as everything else a route declares:

```tsx
// src/routes/products/[id].tsx
import { cachePolicy } from 'janux';

export const cache = cachePolicy({
  name: 'product-page',
  scope: 'public',
  maxAge: '0s',
  sharedMaxAge: '5m',
  swr: '1h',
  tags: ['catalog', 'product:[id]'],
});

export default function Product({ params }: { params: { id: string } }) {
  return <article>…</article>;
}
```

That route now answers with:

```
cache-control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600
cache-tag: catalog, product:42
vary: x-janux-navigation
```

## Private by default, and not by convention

A route that declares nothing answers `cache-control: private, no-store`.

This is the one default that is not a matter of taste. A shared cache holding a
page rendered for a signed-in user is the worst bug this feature could have, and
"remember to mark the private ones" is not a mechanism — it is a hope. So the
direction is inverted: nothing is shareable until a route says so out loud, and
the routes that say so are few, obvious, and reviewable.

Two more fail-safes ride on top, enforced in the pipeline rather than in your
code — the same place [guards](/docs/guide/intents-and-guards) are enforced:

- **A response carrying `Set-Cookie` is downgraded** to `private, no-store`
  whatever it declared, with a warning naming the policy. A public policy tends
  to outlive the page that earned it; this is what stops the day someone adds a
  login to a cached route from being an incident.
- **Public page responses carry `Vary: x-janux-navigation`.** A [SPA
  navigation](/docs/guide/navigation) asks for the same URL and gets a *smaller*
  body (the document already has the CSS). Without `Vary` a CDN would hand that
  stripped body to a browser arriving cold, and the page would paint unstyled.

`no-store` has one real cost: Chrome will not put a `no-store` page in the
back/forward cache. A route that wants restores without becoming shareable says
so, and gets `private, max-age=0` instead:

```ts
export const cache = cachePolicy({ name: 'account', maxAge: '0s' });
```

## The four knobs

| Field | Emits | Means |
|---|---|---|
| `scope` | `public` / `private` | May a *shared* cache keep this? Default `private`. |
| `maxAge` | `max-age` | How long the **browser** may reuse it without asking. |
| `sharedMaxAge` | `s-maxage` | How long the **CDN** may serve it without asking. |
| `swr` | `stale-while-revalidate` | How long a stale copy may still be served *while* it refreshes. |

`sharedMaxAge` and `swr` are meaningless on a private response, so declaring
either without `scope: 'public'` throws where you wrote it rather than quietly
doing nothing.

Durations use the framework's grammar — `'30s'`, `'5m'`, `'1h'` — the same one
[`every()`](/docs/reference/every) uses. Plain milliseconds work too.

The usual shape for a page whose content is public but changes: `maxAge: '0s'`
(browsers always ask, so a purge is visible immediately) with a generous
`sharedMaxAge` and a generous `swr` (the CDN absorbs the traffic and nobody ever
waits for a render).

## Revalidating on demand

Time-based expiry is the fallback, not the plan. What you actually want is:
*when the product changes, that page is wrong* — and to say so.

```ts
import { api, revalidateTag } from '@janux/server';

export const publishProduct = api({
  input: schema({ id: str() }),
  run: ({ input }) => {
    saveProduct(input);
    revalidateTag(`product:${input.id}`);   // this product's page
    revalidateTag('catalog');               // and every listing it appears in
  },
});
```

- `revalidateTag(tag)` drops every cached response carrying that tag.
- `revalidatePath(path)` drops one exact path.

Both are plain function calls, so they belong wherever the change happens — an
`api()` handler, a webhook under `src/api/**`, a server-side intent.

Tags are declared as templates and filled from the matched route params, so
`tags: ['product:[id]']` on `/products/[id]` becomes `product:42` for
`/products/42`. That is deliberate: a template is data the manifest can carry
and a build step could read, where a `(params) => …` closure would be neither.
A template whose param a request cannot fill is dropped rather than emitted with
the brackets intact.

### Reaching the CDN

The same tags go out on a response header, so a real CDN can purge by tag too.
There is no standard for this header, so it is configuration:

| CDN | Header | `janux.config.ts` |
|---|---|---|
| Cloudflare, Akamai | `Cache-Tag` | *(default)* |
| Fastly | `Surrogate-Key` | `cache: { tagHeader: 'Surrogate-Key' }` |
| Netlify | `Netlify-Cache-Tag` | `cache: { tagHeader: 'Netlify-Cache-Tag' }` |

Fastly's space-separated format is handled for you.

## The cache Janux keeps itself

`revalidateTag` has something to drop even with no CDN in front, because the
server keeps its own shared copy of `scope: 'public'` responses. It is what
makes `s-maxage` worth something on a bare Bun server, and it is why the
behaviour is testable without deploying anything.

Every response says which it was:

```
x-janux-cache: HIT     # served from the shared copy
x-janux-cache: STALE   # served stale, refreshing in the background
x-janux-cache: MISS    # rendered for this request
```

It reads its policy from the response's own `Cache-Control`, so the header a CDN
obeys and the copy Janux keeps can never disagree. It never stores a private
response, a non-200, or anything carrying `Set-Cookie`; a stream that fails
halfway is never committed; and a burst of stale hits costs exactly one refresh,
not one each.

Two limits worth knowing rather than discovering: a `Vary: *` response is never
stored (there is no key to build), and the single-flight protection covers
*stale* refreshes, not cold misses — a thundering herd onto a URL nobody has
cached yet still reaches your renderer once per request.

It is bounded (1000 entries, 2 MB per body, least-recently-used first) and inert
until a route declares a public policy — so it costs nothing until you ask. Turn
it off when a CDN in front already holds the same bytes:

```ts
// janux.config.ts
export default defineConfig({
  cache: { shared: false, tagHeader: 'Surrogate-Key' },
});
```

## One model, three places

The words above are not only route words. A `useQuery` in an island and a
`source` on a component say the same two things about the data they hold, with
the same arithmetic:

| | fresh | stale, still shown | too old to show |
|---|---|---|---|
| **Route** | `maxAge` / `sharedMaxAge` | `swr` | past `sharedMaxAge + swr` |
| **`useQuery`** | `staleTime` | `swr` | past `staleTime + swr` |
| **`source`** | `staleTime` | `swr` | past `staleTime + swr` |

```tsx
const products = useQuery(bag, 'products', () => ({
  queryKey: ['products', state.tag],
  queryFn: () => listProducts({ tag: state.tag }),
  staleTime: 30_000,
  swr: 300_000,
  tags: ['catalog'],
}));
```

Past `staleTime` the data is stale and shown while it revalidates. Past
`staleTime + swr` it is *expired*: the query reports `pending` again rather than
render something too old to be true. Without `swr` there is no expiry at all,
which is the default and the behaviour every existing query already has.

`tags` is the same word in both halves, so one mutation can drop both:

```ts
await revalidateTag('catalog');                      // server: pages and the CDN
await getQueryClient().invalidateTag('catalog');     // client: observed queries
```

See [Data cache & URL state](/docs/guide/data-cache) for the client cache in
full, and [the API reference](/docs/reference/data-cache-api).

## Where query hydration fits

SSR builds a fresh `QueryClient` per request and the client refetches on mount —
the double fetch our [roadmap](/docs/guide/architecture-and-roadmap) still owns.
When that payload lands, it does not bring a second cache model with it: a
hydrated entry arrives with the `staleTime`/`swr`/`tags` it was declared with,
so it is fresh, stale or expired by the same arithmetic as everything above.
That is the reason these two knobs are named the same on both sides — there is
one thing to learn, and the hydration work has nowhere to drift to.

## Trying it

`examples/data-cache` has all of it: a public `/catalog` with a tag, a private
`/account` that declares nothing, and a panel that reads the live headers and
revalidates by tag in front of you.

```bash
bun run dev:data-cache
```

```bash
curl -sI localhost:4321/catalog | grep -i 'cache\|vary'
# cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=300
# cache-tag: catalog
# vary: x-janux-navigation
# x-janux-cache: HIT

curl -sI localhost:4321/account | grep -i cache-control
# cache-control: private, no-store
```
