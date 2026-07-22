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

## How the client resumes

On load, `boot()`:

1. Indexes island markers and state snapshots. **No component code runs.**
2. Installs two delegated listeners on `document` (click, submit). That's the entire event system.
3. On first interaction (or first agent call) targeting an island: creates the instance **from the snapshot**, starts its render loop, and runs the intent. The SSR DOM is morphed in place — nodes are preserved, focus is not lost.

The verified guarantee (it's in the test suite): a rendered page executes **zero** component code until you touch it.

## Zero JS for static pages

If a route mounts no islands, the HTML document contains no `<script>` at all — no runtime, no state, no island map. A content site in Janux weighs what hand-written HTML weighs.

## Forms

Intents bound with `<form intent={...}>` are handled by the delegated submit listener; form fields become the intent's input object. Server-side no-JS fallback (a plain POST when the runtime hasn't loaded) is specified in the RFC and on the roadmap — v0.1 requires the runtime for form intents.

## SPA navigation

Once a page is live, navigating between routes is client-side by default — no full reload, no flash of the shell. The initial render is unchanged (full HTML + snapshots); only *subsequent* navigations are intercepted.

**How it works:** Janux uses the browser's [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) (Baseline 2026) to intercept same-origin links, back/forward and `janux.navigate()`. It streams the next page's HTML and **diffs it against the live document** (via `diff-dom-streaming`). Unchanged parts of the shell — a dashboard's sidebar, header, breadcrumbs — are never touched: no flicker, scroll and focus preserved. Browsers without the Navigation API simply do normal MPA navigation, which already works — there's no fallback to maintain.

Because navigating is just a re-render from the incoming snapshots, it costs no hydration — the same resume you already get on first load.

### The three state rules

What survives a navigation is deliberate and agent-legible:

| What | Behavior |
|---|---|
| Stores with `scope: 'app'` (default) | **Survive** — theme, session, anything shared |
| Islands marked `persist` | The live instance and its DOM are kept and grafted onto the incoming page — e.g. `<Copilot persist />` keeps its conversation across pages |
| Everything else | Disposed and **re-resumed** from the incoming page's snapshots |
| Stores with `scope: 'route'` | Disposed |

> **Note:** state that must survive navigation belongs in a store or on the server — not in a plain route island. That's the same principle as resume: islands are ephemeral, stores and the server are durable.

### Opting out and eager mounting

```tsx
<a href="/report.pdf" data-native>Download</a>   {/* full-page navigation */}
<Copilot persist />                              {/* keep instance across navigations */}
<Dashboard eager />                              {/* mount on load/navigation, don't wait for interaction */}
```

```ts
boot({ defs: [...], navigation: false });        // disable SPA navigation entirely
```

Links are prefetched on hover (30s cache) so navigations feel instant.

## Comparison

| | React SSR | Qwik | Janux |
|---|---|---|---|
| Startup work | full hydration replay | resume (QRL loader) | resume (index + listeners) |
| Serialized in HTML | props (then replays) | state + closures (QRLs) | **state only** |
| Serialization limits | — | documented, non-trivial | none (schema-enforced) |
| Agent surface | none | none | manifest, first-class |

The honest trade: Janux restricts you (typed state, no lexical capture in `run`) — the same restrictions the agent surface needs anyway. Paid once, cashed twice.
