# Advanced routing — the full segment grammar

A mini knowledge base whose whole point is its URL space: every pattern the file-system router supports, one section each, navigated as a SPA.

- **Dynamic `[slug]`** — `/wiki/routing` and `/wiki/anything-else` land on `wiki/[slug].tsx`; the page reads `params.slug` and `meta` titles the tab per article.
- **Typed matchers `[id=integer]` / `[uid=uuid]`** — `/tickets/123` and `/tickets/2b0d7b3d-…` hit two different pages sharing one segment; `/tickets/abc` matches neither and is a router-level 404 — no page validates its own param.
- **Catch-all `[...path]`** — `/docs/guides/deploy/vercel` resolves to `docs/[...path].tsx` with the joined tail in `params.path`; every breadcrumb it renders is itself a valid catch-all URL.
- **Optional catch-all `[[...filters]]`** — `/search` works with zero rest segments, `/search/kind/article` with two.
- **Nested layouts `_layout.tsx`** — a root shell on every page, plus a wiki sub-shell (article sidebar) that wraps only `/wiki/**`.
- **Route groups `(marketing)`** — `/about` and `/pricing` share the group's banner layout without the directory ever appearing in the URL.
- **SPA navigation** — plain anchors, intercepted and diffed; the `NavCounter` island is rendered `persist` from the shell, so its live instance is grafted onto every incoming page and the count survives navigations.
- **Request context `src/ctx.ts`** — whatever it returns reaches every page and layout as `ctx`. Here it is the current pathname, which is how the header can mark the active section (`aria-current="page"`) and how the `(marketing)` sub-shell highlights its own link — including after a SPA navigation, since the incoming HTML is what the diff applies.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Where things live

```txt
src/routes
├── _layout.tsx               → root shell on every page (nav + NavCounter island)
├── index.tsx                 → /
├── (marketing)               → group: organizes files, invisible in the URL
│   ├── _layout.tsx           → the group's banner sub-shell
│   ├── about.tsx             → /about
│   └── pricing.tsx           → /pricing
├── wiki
│   ├── _layout.tsx           → wiki sub-shell: article sidebar
│   ├── index.tsx             → /wiki (static index, never shadowed by the sibling)
│   └── [slug].tsx            → /wiki/:slug — one dynamic segment
├── docs
│   └── [...path].tsx         → /docs/a/b/c — one or more segments, joined in params.path
├── search
│   └── [[...filters]].tsx    → /search and /search/f1/f2 — zero or more segments
└── tickets
    ├── index.tsx             → /tickets
    ├── [id=integer].tsx      → /tickets/123 — digits only
    └── [uid=uuid].tsx        → /tickets/2b0d7b3d-… — uuids only; /tickets/abc → 404
```

| File | What it shows |
|---|---|
| `src/data/kb.ts` | The articles and tickets the pages render — data, no routing |
| `src/components/NavCounter.tsx` | The `persist` island whose state survives every SPA navigation |
| `src/client.ts` | `boot()` — which is also what turns every plain anchor into a SPA navigation |
| `src/ctx.ts` | The per-request context: the pathname the shell needs to mark its active tab |
| `src/styles.css` | The one sheet the app ships — the shell, the cards and the section skins |

## What the UI shows

The header is the root shell: brand, one pill per section with the current one highlighted, and the `NavCounter` island on the right — click it, navigate anywhere, the count stays. The home page lists every pattern as a card (URL, file pattern, one line of why). Each section then makes its own point visible: the wiki draws its sub-shell as a dashed sidebar with the open article marked, `/docs/**` turns each catch-all segment into a breadcrumb chip, `/search` shows the rest segments as chips (and none at all on `/search`), tickets badge the matcher that let the URL through, and the `(marketing)` group wraps `/about` and `/pricing` in a tinted panel of its own. A URL that matches a route but has nothing behind it — `/wiki/definitely-not-written` — renders as an amber "matched, but empty" card; a URL no pattern matches never reaches a page at all (404 from the router).
