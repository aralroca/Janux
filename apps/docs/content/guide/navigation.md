# Navigation

Janux navigates like a single-page app without you writing a router. The first page is server-rendered HTML with everything in it (as always); every *subsequent* navigation is intercepted client-side, so moving between routes is instant and the shell — a dashboard's sidebar, header, breadcrumbs — never flickers.

It's on by default for any app that calls `boot()`. Pure static pages (no islands, no `boot()`) stay classic multi-page navigation, which is exactly right: with no runtime there's nothing to intercept.

## How it works

When you click a link, go back/forward, or call `janux.navigate()`:

1. Janux intercepts the navigation through the browser's [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API).
2. It **streams** the next page's HTML and **diffs it against the live document** (using [`diff-dom-streaming`](https://github.com/brisa-build/diff-dom-streaming)).
3. Only what actually differs is touched. Identical parts of the page — your layout, the sidebar you're scrolled halfway down, the input you're focused in — are left exactly as they are.

Because a navigation is just a re-render from the incoming page's snapshots, it costs **no hydration** — the same resume you already get on first load. There's no client router, no route manifest, no data-loader waterfall.

> **Note:** the Navigation API is [Baseline 2026](https://web.dev/blog/baseline-navigation-api) (Chrome, Edge, Firefox, Safari). Browsers without it fall back to normal full-page navigation — which already works in Janux — so there's no legacy History-API code path to reason about.

## Why diff, not swap

Most HTML-over-the-wire routers *replace* the page body (Turbo) or swap `<head>`/`<body>` (Astro's ClientRouter). Janux **diffs the whole document** instead, and that difference is the whole point for app-shaped UIs:

- A console has a sidebar, a top bar, breadcrumbs — **identical on every route**. A swap re-creates them (flash, lost scroll, lost focus); a diff doesn't touch them at all.
- `<title>` and `<meta>` update for free, because they're just part of the diff.
- Streaming means the diff starts patching before the response has fully arrived.

## What survives a navigation

This is the part a plain MPA (or native cross-document view transitions) can't give you: **typed state continuity**, and it follows three rules.

| What | Behavior |
|---|---|
| Stores with `scope: 'app'` (the default) | **Survive** — theme, session, sidebar collapse state, anything shared |
| Islands marked `persist` | The live instance *and its DOM* are kept and grafted onto the new page |
| Everything else | Disposed, and **re-resumed** from the incoming page's snapshots |
| Stores with `scope: 'route'` | Disposed (unless a surviving `persist` island still uses them) |

```tsx
// This copilot keeps its conversation as the user moves between pages:
<Copilot persist />

// A shared store — read by islands on every route — never resets:
export const theme = store({ name: 'theme', scope: 'app', /* ... */ });
```

The mental model is the same one that powers resume: **islands are ephemeral, stores and the server are durable.** State that must outlive a navigation belongs in a store (or on the server), not in a plain route island. Put it there and it survives; leave it in a route island and it re-resumes from the fresh page — by design, not by accident.

## Eager islands

By default an island resumes lazily — no code runs until you interact with it. Some islands need to be live from the moment the page appears: an editor, a component that only listens for events (a toast host), a dashboard panel that polls. Mark them `eager`:

```tsx
<Toasts eager />        {/* starts listening immediately, and after every navigation */}
<Editor eager />        {/* the editor IS the page — mount it on arrival */}
```

Eager islands mount on initial load and after each navigation.

## Opting a link out: `data-native`

`data-native` tells Janux to **leave one link alone** — no interception, no diff, no hover-prefetch. The browser performs an ordinary full-page navigation, exactly as if Janux weren't on the page.

```tsx
<a href="/report.pdf" data-native>Download</a>   {/* full-page navigation, not a diff */}
```

It's a per-link escape hatch, not a workaround — reach for it whenever a diffed navigation isn't the right behavior:

- **Non-Janux responses** — a file download, an API endpoint, or a route served by a different app. There's no incoming Janux page to diff against.
- **Leaving your origin** — external links and third-party auth redirects. (Cross-origin links already aren't intercepted; `data-native` just makes the intent explicit.)
- **A Janux page that must paint from a clean slate.** This is the non-obvious one. If a page mounts a widget that *measures the layout as it initializes* — a code editor, a canvas, a charting library — arriving via a diff can hand it a container that the new page's CSS hasn't finished applying yet, so it measures the wrong size and renders misaligned. A full load guarantees the page is laid out before the widget mounts. It's exactly why the [Playground](/playground) link in this site's sidebar is marked `data-native`: Monaco measures itself on mount, and an SPA revisit could catch it mid-layout.

> **Rule of thumb:** if the destination isn't a Janux page, or its first paint depends on the browser having fully laid out a fresh document, use `data-native`. Everything else should stay a diffed navigation — that's what keeps the shell, scroll and focus intact.

To turn SPA navigation off everywhere instead of per-link:

```ts
boot({ defs: [...], navigation: false });        // disable SPA navigation entirely
```

Same-origin links that *aren't* opted out are **prefetched on hover** (30-second cache), so by the time the click lands the HTML is usually already in hand.

## Programmatic and agent navigation

`janux.navigate(url)` navigates from code — and it's the same call agents use, so a copilot can move the user between pages as part of a task:

```ts
await window.janux.navigate('/orders/8821');
```

Navigations count toward `settled()`, so automation and tests can await them deterministically:

```ts
await janux.navigate('/reports');
await janux.settled();   // resolves once the page has swapped and re-resumed
```

Listen for `janux:navigate` to drive a progress bar or analytics — it fires `{ phase: 'before' | 'after', from, to }` around each navigation.

## Building a console-style dashboard

Everything above adds up to the pattern Janux is built for — a persistent shell with a content area that changes:

```tsx
// routes/dashboard/[section].tsx
export default function Dashboard({ params }) {
  return (
    <div class="console">
      <Sidebar active={params.section} />   {/* static — the diff never touches it between sections */}
      <TopBar />                            {/* static shell */}
      <main>
        <SectionPanel section={params.section} />   {/* the only thing that changes */}
      </main>
      <Copilot persist />                   {/* one assistant across the whole console */}
    </div>
  );
}
```

Clicking through the sidebar swaps only `<main>`; the sidebar keeps its scroll and highlight, the copilot keeps its conversation, the theme store keeps the user's dark-mode choice — all without a single line of routing code, and all still visible to agents through the manifest.

Reference: [`navigate`, `persist`, `eager`, events](/docs/reference/client-api#spa-navigation).
