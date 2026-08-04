---
title: Migrating from Next.js
description: What a codemod can translate from a Next app, what it cannot, and the parts of the model you have to rethink before any of it helps.
---

# Migrating from Next.js

This page is deliberately unflattering about how much of this is automatic. The routing, the metadata and a handful of imports translate mechanically, and `janux codemod` does those for you. The component model does not translate at all — and that is the part that decides whether the migration is worth doing.

Read the last two sections first if you are still evaluating.

## Run the codemods

Work on a clean branch, and look before you leap: every codemod takes `--dry-run`, which prints the diff it would write and writes nothing.

```bash
janux codemod next/routes --dry-run   # file structure, and the imports the moves break
janux codemod next/metadata --dry-run # export const metadata → export const meta
janux codemod next/imports --dry-run  # the next/* imports that have an equivalent
```

Drop `--dry-run` to apply, in that order — `next/routes` decides where files end up, and the other two edit what by then are the same files. Each one is idempotent, so running it twice costs nothing.

Everything they cannot do, they say, naming the file:

```txt
! src/routes/blog/[slug]/index.tsx: `next/link` (Link): A Janux link is a plain `<a href>` …
! app/loading.tsx: `loading` has no file equivalent: a Janux boundary is `suspense:` on the `component()` that is waiting.
```

That list is the real migration plan. The codemods are the boring half.

## What translates

### Route structure

The segment grammar is the same in both routers — `[id]`, `[...rest]`, `[[...rest]]` and `(group)` mean exactly what you expect — so the whole translation is the file-name convention around it. Next puts a directory's role in the file name; Janux puts it in a prefix.

| Next | Janux |
|---|---|
| `app/page.tsx` | `src/routes/index.tsx` |
| `app/blog/[slug]/page.tsx` | `src/routes/blog/[slug]/index.tsx` |
| `app/layout.tsx`, `app/blog/layout.tsx` | `src/routes/_layout.tsx`, `src/routes/blog/_layout.tsx` |
| `app/not-found.tsx` | `src/routes/_404.tsx` |
| `app/error.tsx`, `app/global-error.tsx` | `src/routes/_500.tsx` |
| `app/api/users/[id]/route.ts` | `src/api/users/[id].ts` |
| `pages/index.tsx`, `pages/blog/[slug].tsx` | `src/routes/index.tsx`, `src/routes/blog/[slug].tsx` |
| `pages/_app.tsx` | `src/routes/_layout.tsx` |
| `pages/404.tsx`, `pages/500.tsx` | `src/routes/_404.tsx`, `src/routes/_500.tsx` |
| `pages/api/hello.ts` | `src/api/hello.ts` |
| `middleware.ts` | `src/middleware.ts` (move it by hand; the signature is the same shape) |

Two things about this are worth knowing before you read the diff.

**Colocated files move out.** `src/routes` turns every file that does not start with `_` into a route, so a `PostCard.tsx` left beside its page would become the URL `/blog/PostCard`. The codemod moves colocated files to `src/components/**`, mirroring the folder they were in, and rebases every relative import in the tree so it still points at the same module afterwards. If `src/components` is not where you want them, move them again — the imports are already correct relative to wherever they land next.

**Handlers all live under `/api`.** Janux mounts `src/api` at `/api`, so an App Router `route.ts` that was *not* under `app/api` changes URL: `app/rss/route.ts` starts answering `/api/rss`. The codemod flags each one. An App Router handler needs no other change — it already exports functions named by HTTP method that return a `Response`, which is exactly Janux's contract. A Pages Router handler does: `(req, res)` becomes `({ req, params, ctx, url })` returning a `Response`.

### Metadata

`export const metadata` becomes `export const meta`. `PageMeta` keeps the flat shape the emitted tags actually have, so the translation is mostly un-nesting:

```tsx
import type { PageMeta } from 'janux';

export const meta: PageMeta = {
  title: 'The blog',
  canonical: '/blog',                    // was alternates.canonical
  og: { type: 'article', image: '/og.png' }, // was openGraph.images: ['/og.png']
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};
```

`metadataBase` is dropped: Janux resolves root-relative `image` and `canonical` against `siteUrl` in `janux.config.ts`, once, for the whole app. Fields `PageMeta` has no home for — `keywords`, `icons`, `verification` — are left in place and reported, because carrying them through `meta.head` is a decision about your `<head>`, not a rename.

`generateMetadata` becomes an exported `meta` **function**, which Janux awaits. The name is all the codemod changes; check the signature yourself, because it differs in a way types will not always catch:

```tsx
import type { PageMeta } from 'janux';

export async function meta({ params }: { params: { slug: string } }): Promise<PageMeta> {
  return { title: params.slug };
}
```

Janux passes `{ ctx, params }`, and `params` is already resolved — it is not a promise, as it became in Next 15.

### Imports

`next/image` becomes `Image` from `janux`, and `notFound` from `next/navigation` becomes `notFound` from `janux`. That is the whole list of clean mappings. Everything else in `next/*` is removed from the import and reported:

| Next | In Janux |
|---|---|
| `next/link` | A plain `<a href>`. Navigation is delegated and hovering prefetches; `prefetch`/`replace`/`scroll` are app-wide config, not per link |
| `next/head` | `export const meta`, and `meta.head` for whatever the fields do not cover |
| `next/dynamic` | Nothing to do: an island already loads on interaction, and `suspense:` covers the deliberate boundary |
| `NextResponse` | `Response`. `NextResponse.json(x)` is `Response.json(x)` |
| `next/font/google` | The `fonts` array in `janux.config.ts` — self-hosted, same idea |
| `next/cache` | `revalidateTag`/`revalidatePath` from `@janux/server`; per-route caching is `cachePolicy` |
| `useRouter`, `usePathname`, `useSearchParams` | A route reads `params` and `url` from its own arguments; client state that belongs in the URL uses `urlState()` |

## What does not translate

**`'use client'` and `'use server'` have no meaning here, and no codemod can invent one.** This is the whole migration.

Next splits a tree into server components and client components, and the directive is the seam. Janux has no such seam: a page is server-rendered HTML, and the interactive parts of it are **islands** — `component()` definitions that resume on the first interaction without hydrating the page around them. There is no client bundle for a page with no islands, and `janux build` emits zero JavaScript for one.

So the mapping is not file-to-file:

- A **server component** is usually just markup in the page, or a plain function the page calls. Delete the wrapper.
- A **client component** becomes a `component()` with `state`, `intents` and a `view` — not a function with `useState`.
- A **Server Action** becomes an `intent()`, which is the same idea with the guard rail attached: one invocation pipeline for clicks, agent calls and HTTP, with the guard resolved in the pipeline rather than in your handler.

Also unavailable, on purpose or not yet:

- **React hooks.** `useState`, `useEffect`, `useMemo`, `useContext` — none of these exist in a Janux island. State is a schema-typed signal store; effects are named `effect()` sections. You can still run React unchanged inside `foreign()`, hooks and all, when a library is worth it.
- **Parallel and intercepting routes** (`@slot`, `(.)`). On the roadmap. URL-addressable modals are query-string state today.
- **`loading.tsx` / `template.tsx` / `default.tsx`.** A loading boundary is `suspense:` on the component that is waiting.
- **Metadata file conventions** (`opengraph-image.tsx`, `icon.tsx`, `sitemap.ts`, `robots.ts`). Assets go in `public/`; `sitemap` and `robots` are three lines in `src/api`.
- **Image loaders and `placeholder="blur"`.** Janux's `Image` sizes from a fixed width set and optimizes at build; there is no loader to configure and no blur placeholder.

## What you have to rethink

Here is the same counter, both ways. Next:

```tsx
'use client';
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Janux:

```tsx
import { component, int, intent, schema } from 'janux';

export const Counter = component({
  name: 'counter',
  description: 'A counter an agent can also press.',
  state: schema({ count: int() }),
  intents: {
    add: intent({ description: 'Increment the counter', run: ({ state }) => (state.count += 1) }),
  },
  view: ({ state, intents }: any) => <button onClick={intents.add}>{state.count}</button>,
});
```

The extra lines are the point of the framework, not ceremony. Because the behavior is *named* and the state is *schema-typed*, this component is simultaneously a UI and an MCP tool: an agent can call `counter.add` through the same pipeline and the same guard as the click, and the manifest describing it is derived from this definition rather than written twice. If you do not want that, Janux is a worse Next and you should stay where you are.

The honest checklist before you start:

- **You use React libraries you cannot replace.** Fine — `foreign()` mounts them unchanged. Check the [interop matrix](/docs/more/interop-matrix) for the ones already tested.
- **Your app is mostly static content.** This migration is short and the payoff is immediate: [content collections](/docs/guide/content-collections) and a zero-JS build.
- **Your app is a large RSC tree with deep client boundaries.** Budget for a rewrite of the interactive parts. The routes and the metadata are an afternoon; the components are the project.
- **You depend on the Next deployment platform's edge behavior.** Read [the adapters recipe](/docs/recipes/adapters) before committing.

## Where to go next

- [Mental model](/docs/getting-started/mental-model) — islands, intents and resumability in one page
- [Components](/docs/guide/components) and [Intents & guards](/docs/guide/intents-and-guards)
- [Routing & navigation](/docs/guide/navigation) — the segment grammar in full
- [Codemods & `janux upgrade`](/docs/reference/codemods) — the catalog, and how versioned codemods work
