# Hacker News

The canonical Hacker News clone, Janux-style — 30 deterministic local stories, no network:

- **Streaming SSR + `suspense`** — the front page is one island whose source is deliberately slow (~400ms): the skeleton streams first, the ranked list swaps in later **in the same response**, on first load and on SPA navigations.
- **Pagination** — `/news/2` and `/news/3` seed the same island with `initial={{ page }}` through a typed `[page=integer]` route.
- **Nested comments, 0 KB** — `item/[id]` is an async route: the whole comment tree arrives fully server-rendered as nested markup (`.comment` inside `.comment`).
- **`useQuery` refresh** — the score on an item page re-checks itself client-side through the query cache (the `refresh` intent rotates the query key), and the Algolia-style footer search filters the cached fixture.
- **Hover prefetch** — every anchor is plain HTML; hovering one warms the destination stream (`x-janux-navigation` fetch), so the click paints instantly.
- **Deterministic fixture** — stories and comment trees are pure formulas over the story id (`src/data/stories.ts`), so tests assert exact content.

> **Why the footer search island is structural:** a suspense island registers only once its
> sources resolve, and the production server ships the runtime based on the islands registered
> when the page's own HTML completes (`islandModules` has no producer today). A page whose only
> island is a suspense boundary would therefore ship **no runtime** — no SPA navigation, no hover
> prefetch. The non-suspense footer island is what makes the streamed front page interactive,
> the same role `Counter` plays in `examples/with-suspense`.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Where things live

| File | What |
| --- | --- |
| `src/data/stories.ts` | The deterministic fixture: 30 stories + nested comment trees |
| `src/server/hn.api.ts` | `listStories` / `getItem` apis with small artificial latency |
| `src/components/StoryList.tsx` | The suspense island: skeleton fallback, ranked list, pager |
| `src/components/LiveScore.tsx` | `useQuery`-backed score with a client-side refresh intent |
| `src/components/SearchBox.tsx` | Footer search over the cached fixture (`useQuery`) |
| `src/components/CommentTree.tsx` | Static recursive comment tree (server-rendered, no JS) |
| `src/routes/index.tsx` | The front page (`page 1`) |
| `src/routes/news/[page=integer].tsx` | Pages 2 and 3 |
| `src/routes/item/[id=integer].tsx` | One story with its comments — `notFound()` when the id matches no story |
| `src/routes/_404.tsx` | The page an unknown URL (or a missing story) gets, under a 404 |
