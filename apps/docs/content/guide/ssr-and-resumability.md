---
title: SSR and resumability
description: Janux server-renders every route. Static components become plain HTML; bifacial components become islands that resume — they do not hydrate.
---

# SSR and resumability

Janux server-renders every route. Static components become plain HTML; bifacial components become **islands** that resume — they do not hydrate.

## What the server sends

```html
<janux-island data-jx="cart#default">…rendered HTML…</janux-island>
<script type="application/janux+state" data-uri="ui://cart#default">
  {"state":{"items":[{"productId":"p1","qty":2,"unitPrice":1999}]},
   "sources":{"catalog":{"value":{"products":[…]}}}}
</script>
```

State is plain JSON by construction (schema-typed), so serialization is `JSON.stringify` — no closure serialization, no serializability documentation, no bail-outs. Sources load on the server before rendering, so islands arrive with real content, not skeletons — and **source values travel in the snapshot**: a resumed island never re-fetches what the server already loaded, and `ready`-gated intents work from the very first click.

## Streaming

The server does not wait for the page to finish rendering before it starts answering. The document goes out in three parts:

1. **The head, immediately** — title, meta, styles and the manifest link come from the route, not from the render, so the browser can start fetching stylesheets while the body is still being produced.
2. **The body, as each part resolves** — in document order. Sibling islands still load their sources *in parallel* (nothing is serialized by putting it later in the page); what changes is that an island that is ready is flushed instead of waiting behind a slow one. A slow source holds back its own island's children, not the page — and an island with a `suspense` view holds back nothing at all (next section).
3. **The tail, once the render is done** — state snapshots, the island map and the i18n payload, which can only be known after every island has rendered.

Both a first load and a [client navigation](/docs/guide/navigation) are served this way, and the client consumes them the same way: the navigation diff patches the document as chunks arrive.

## Suspense boundaries

A slow island normally holds back its own children. Give it a `suspense` view and it stops holding back even those: the fallback streams in place, the page never waits, and the real content arrives later **in the same response** and swaps in.

```tsx
import { component, source } from 'janux';

export const SlowStats = component({
  name: 'slow-stats',
  sources: { stats: source({ query: () => fetchStats() }) }, // deliberately slow
  suspense: () => <p class="skeleton">Loading stats…</p>,
  view: ({ sources }) => <p>{sources.stats.value.length} stats</p>,
});
```

How it travels: the island is emitted with its fallback and a `data-jx-pending` marker, and when its sources resolve, a trailing chunk delivers the content as an inert `<template>` plus a tiny inline swap call — no extra request, no render-blocking script. Boundaries flush in **resolution order**, not document order: two slow islands swap independently, whichever is ready first. If a source settles immediately (a cache hit), the content is inlined and no boundary exists at all.

The page does not wait for the boundaries to become interactive: the moment its own HTML is complete, an **interlude** ships the runtime, the snapshots that already exist and the navigation scripts — before the trailing chunks. A counter next to a slow island reacts to clicks while the skeleton is still shimmering. (The interlude kicks the runtime with a classic inline `import()`: a `<script type="module">` would defer until the document finishes parsing, which for a streaming response means after the last boundary.) Only what cannot exist mid-stream travels in the tail: the i18n payload and the boundary islands' own snapshots — a resumed suspense island never re-fetches what the server already loaded.

The same mechanism runs during a [client navigation](/docs/guide/navigation): the streaming diff paints the fallback, the trailing chunk arrives, the swap executes. The swap machinery removes itself, so the settled DOM is byte-for-byte what a non-streamed render would have produced.

Suspense is opt-in per island and coexists with reading `sources.x.pending` / `sources.x.error` in the view — use whichever fits: a boundary for first-paint layout, reactive reads for in-place refreshes. Keep fallbacks static markup (a skeleton, not more islands): they are discarded at swap time.

## Error boundaries

An `error` view makes an island its own containment: if anything in its SSR subtree throws — its `view`, a static child, or a nested island without an `error` view of its own — the island renders the error view instead, and the rest of the page never notices. The thrown value arrives as `bag.error`.

```tsx
import { component } from 'janux';

export const Report = component({
  name: 'report',
  error: ({ error }) => <p class="error">Report failed: {String(error)}</p>,
  view: () => {
    throw new Error('the data was corrupt');
  },
});
```

Failures route to the nearest boundary, React-style: a nested island's throw bubbles up until an ancestor island declares `error`. With no boundary anywhere above, the island **fails soft** — what streamed before the throw stays (elements close cleanly), the island closes, and the failure is reported via a `janux:error` event plus a server-side log. Either way the page survives and stays interactive.

Two interactions worth knowing:

- **With suspense:** if a suspended island's content throws, the error view is what swaps in — the fallback never gets stuck. A suspended island resolves its own failure and never bubbles to an ancestor: by the time the failure exists, the ancestor's markup is already on the wire. Give a suspended island its own `error` view if its failure needs UI.
- **With sources:** a *rejecting source* is not a throw. It lands in `sources.x.error` for the view to render as it chooses; the `error` view is for renders that fail.

If a render throws **outside any island** after the first flush, the status line is already on the wire and cannot be changed to a 500. Janux closes the document and reports it in-page instead: a `janux:error` event (the same one a failed navigation fetch dispatches) plus a console trace. It does not reload — a deterministic render error would fail again the same way. A failure *before* the first flush is still a normal 500.

`renderToStream()` is the API behind this if you assemble a server yourself; see the [core API reference](/docs/reference/core-api#rendertostreamnode-options).

## How the client resumes

On load, `boot()`:

1. Indexes island markers and state snapshots. **No component code runs.**
2. Installs two delegated listeners on `document` (click, submit). That's the entire event system.
3. On first interaction (or first agent call) targeting an island: creates the instance **from the snapshot**, starts its render loop, and runs the intent. The SSR DOM is morphed in place — nodes are preserved, focus is not lost.

The verified guarantee (it's in the test suite): a rendered page executes **zero** component code until you touch it.

## Zero JS for static pages

If a route mounts no islands, the document ships no JavaScript at all — no runtime, no state, no island map. A content site in Janux weighs what hand-written HTML weighs. The one `<script>` tag such a page carries is the [speculation rules](/docs/guide/navigation#prefetching-and-speculation-rules) JSON, which the browser reads as data and never executes; set `navigation.speculationRules: false` if you want the document free of script tags entirely.

## Forms

Intents bound with `<form onSubmit={...}>` are handled by the delegated submit listener; form fields become the intent's input object. Server-side no-JS fallback (a plain POST when the runtime hasn't loaded) is on the roadmap — today the runtime is required for form intents.

## Navigation and resume are the same machinery

Client-side navigation in Janux is just resume applied to a new page: the incoming HTML brings its own snapshots, and islands resume from them exactly as on first load — no hydration, no route manifest. Because it reuses everything on this page, it's covered on its own: see **[Navigation](/docs/guide/navigation)** for how the diff-based SPA router works, what state survives a navigation, and building console-style dashboards.

## Comparison

| | React SSR | Qwik | Janux |
|---|---|---|---|
| Startup work | full hydration replay | resume (QRL loader) | resume (index + listeners) |
| Serialized in HTML | props (then replays) | state + closures (QRLs) | **state only** |
| Serialization limits | — | documented, non-trivial | none (schema-enforced) |
| Agent surface | none | none | manifest, first-class |

The honest trade: Janux restricts you (typed state, no lexical capture in `run`) — the same restrictions the agent surface needs anyway. Paid once, cashed twice.

> **See it running**: [`examples/nested-islands`](https://github.com/aralroca/Janux/tree/main/examples/nested-islands) — stateful islands three levels deep, resumed independently. More in [Examples](/docs/more/examples).
