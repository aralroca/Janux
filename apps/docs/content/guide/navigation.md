---
title: Navigation
description: Janux navigates like a single-page app without you writing a router.
---

# Navigation

Janux navigates like a single-page app without you writing a router. The first page is server-rendered HTML with everything in it (as always); every *subsequent* navigation is intercepted client-side, so moving between routes is instant and the shell — a dashboard's sidebar, header, breadcrumbs — never flickers.

## The route tree

Routes are files under `src/routes`. `index.tsx` → `/`, `orders/[id].tsx` → `/orders/:id`. The full segment grammar:

| Segment | Matches | `params` |
|---|---|---|
| `about.tsx` | `/about` (static) | — |
| `[id].tsx` | `/42`, `/ana` (one segment) | `{ id }` |
| `[id=integer].tsx` | `/42` only — a **typed matcher** gates the match | `{ id }` |
| `[...path].tsx` | `/a/b/c` (one or more) | `{ path: "a/b/c" }` |
| `[[...path]].tsx` | `/`, `/a/b` (zero or more, optional) | `{ path }` |

Built-in matchers: `integer`, `uuid`. Add your own in `src/matchers.ts` (each export is a `(value) => boolean`):

```ts title="src/matchers.ts"
export const slug = (value: string) => /^[a-z0-9-]+$/.test(value);
// then: routes/blog/[post=slug].tsx
```

**Route-sort spec (deterministic).** When several patterns could match, specificity is compared segment-by-segment, most-specific first: **static > typed > dynamic > catch-all > optional-catch-all**; an exact-depth route beats a rest segment that would swallow it; ties break on pattern text. Order never depends on file-system enumeration.

## Layouts & route groups

A `_layout.tsx` at any level wraps its subtree. Its default export receives `{ children, ctx, params }` and layouts **compose top-down** (outermost directory first):

```tsx
// routes/console/[team]/_layout.tsx
export default function TeamLayout({ children, params }) {
  return (
    <div class="console-shell" data-team={params.team}>
      <Sidebar team={params.team} />
      <main>{children}</main>
    </div>
  );
}
```

`(group)` directories organize files and attach their own layout **without appearing in the URL** — `routes/(marketing)/pricing.tsx` serves `/pricing` wrapped in `(marketing)/_layout.tsx`. Use groups to give different sections different root shells.

## Not found & server errors

Two more underscore files at the root of `src/routes`, discovered the same way layouts are:

| File | Renders when | Status | Wrapped in `_layout.tsx` |
|---|---|---|---|
| `_404.tsx` | no route matches, or a page called `notFound()` | `404` | yes |
| `_500.tsx` | a page threw while the server was building it | `500` | no |

Both receive `{ ctx }` (`_500` also gets the thrown `error`) and an optional `meta` export works as on any page. Neither receives `params`: no route matched.

```tsx title="src/routes/_404.tsx"
export const meta = { title: 'Page not found', robots: 'noindex' };

export default function NotFound() {
  return (
    <main>
      <h1>This page does not exist</h1>
      <a href="/">← Back home</a>
    </main>
  );
}
```

Without either file the framework answers the bare status line (`Not found` / `Internal Server Error`) — the status has always been right; the page is what was missing.

### `notFound()`: a route that matched but has nothing to show

`/posts/does-not-exist` matches `posts/[slug].tsx`. Only the page knows there is no such post, so the page says it:

```tsx title="src/routes/posts/[slug].tsx"
import { notFound } from 'janux';
import { postBySlug } from '../../content';

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  if (!post) notFound();

  return <article>{post.title}</article>;
}
```

`notFound()` throws, so nothing after it runs — and TypeScript narrows `post` for you. Call it from the route module (or something it awaits): once the first bytes of the document are on the wire the status line is already sent, and a `notFound()` from a component the stream reaches later can no longer change it.

Alternatives that are **not** this: rendering your own "not found" markup with a `200` (a crawler indexes it, an agent believes it), or a catch-all route (`[[...slug]].tsx`) that swallows every URL to fake one.

### `_500.tsx` renders alone

`_500.tsx` deliberately skips the layout chain: the layout is code too, and code is what just failed. Its default export receives `{ ctx, error }` — the thrown value, for you to report, not to print:

```tsx title="src/routes/_500.tsx"
export default function ServerError({ error }: { error: unknown }) {
  return <main><h1>Something went wrong</h1></main>;
}
```

Janux logs the failure server-side before rendering it. Two things this does **not** cover: a failure *after* the first flush (the page is already streaming — the runtime dispatches [`janux:error`](/docs/recipes/error-handling) instead) and `api()` / HTTP handler failures, which answer with their own JSON envelope.

With `output: 'static'`, `janux build` writes `_404.tsx` to `404.html` — the file static hosts serve for a path they have nothing at.

## Middleware

`src/middleware.ts` runs before routing on every request; return a `Response` to short-circuit (redirects, locale hardening, auth gates), or nothing to continue:

```ts title="src/middleware.ts"
export default function middleware(req: Request): Response | undefined {
  const url = new URL(req.url);

  if (url.pathname === '/old') return new Response(null, { status: 308, headers: { location: '/new' } });
}
```

## SPA navigation

It's on by default for any app that calls `boot()` — and there is nothing to opt in to. No `<Link>`
component, no router import, no special prop: **a plain anchor is the router**.

```tsx
export const MainNav = component({
  name: 'main-nav',
  view: () => (
    <nav>
      <a href="/">Home</a>
      <a href="/orders/42">Order #42</a>
      <a href="/settings">Settings</a>
    </nav>
  ),
});
```

Every one of those links is intercepted automatically: hovering prefetches the destination, the
click streams the next page and diffs it in place, and back/forward run through the same pipeline.
Links that shouldn't be intercepted — external origins, downloads, anchors marked
[`data-native`](#opting-a-link-out-data-native) — are left to the browser.

A link to **the page you are already on** is a no-op: the navigation is cancelled, nothing
re-renders and nothing reloads, so a persisted assistant or a half-filled form survives an idle
click on the current menu item. Reloads are untouched, and a `data-native` link to the current
page keeps the full reload it asked for.

Pure static pages (no islands, no `boot()`) stay classic multi-page navigation, which is exactly right: with no runtime there's nothing to intercept.

## How it works

When you click a link, go back/forward, or call `janux.navigate()`:

1. Janux intercepts the navigation through the browser's [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API).
2. It **streams** the next page's HTML and **diffs it against the live document** (using [`diff-dom-streaming`](https://github.com/brisa-build/diff-dom-streaming)).
3. Only what actually differs is touched. Identical parts of the page — your layout, the sidebar you're scrolled halfway down, the input you're focused in — are left exactly as they are.

Because a navigation is just a re-render from the incoming page's snapshots, it costs **no hydration** — the same resume you already get on first load. There's no client router, no route manifest, no data-loader waterfall.

Nothing is buffered on either side: the server flushes the page [as it renders it](/docs/guide/ssr-and-resumability#streaming) and the client diffs it as it arrives, so on a slow link the new heading and the parts that already exist appear while the rest is still on the wire.

> **Note:** the Navigation API is [Baseline 2026](https://web.dev/blog/baseline-navigation-api) (Chrome, Edge, Firefox, Safari). Browsers without it fall back to normal full-page navigation — which already works in Janux — so there's no legacy History-API code path to reason about.

### Clicking faster than the pages arrive

Navigations are serialized and each one **cancels the one before it**: the superseded fetch is aborted, its stream is torn down mid-diff, and only the last click you made decides where you end up. A superseded navigation never reports itself as finished (no `janux:navigate` `after` event) and never disposes an island — so clicking three sidebar entries in a second leaves you on the third, with your assistant still open, and with two requests the server stopped sending.

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

> **`persist` has one requirement: every route must render the island.** It's lifted out of the document before the diff and grafted back over whatever the incoming page rendered for it — and if that page doesn't render it, there is nothing to graft onto and the live instance is disposed. Render it from a shared layout and it survives the whole session; forget it on one route and it closes the moment the user goes there — with a console warning naming the island and the route when it does.

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
- **A Janux page that must paint from a clean slate.** This is the non-obvious one. If a page mounts a widget that *measures the layout as it initializes* — a code editor, a canvas, a charting library — and its own teardown can't restore a clean slate, a full load guarantees the page is laid out before the widget mounts. This site's [Playground](/playground) (Monaco) used to need it; since the widget tears itself down properly, plain SPA links work — the escape hatch stays for widgets you don't control.

> **Rule of thumb:** if the destination isn't a Janux page, or its first paint depends on the browser having fully laid out a fresh document, use `data-native`. Everything else should stay a diffed navigation — that's what keeps the shell, scroll and focus intact.

## Prefetching and speculation rules

Two mechanisms warm the next page, and which one applies depends on who performs the navigation.

**Janux prefetch — for the links Janux intercepts.** Hovering a same-origin link fetches it and keeps the *stream*, which the diff then consumes directly, so the click usually starts painting immediately. The page's [route manifest](/docs/reference/core-api) comes with it, so the agent surface is live the moment the navigation lands instead of one request later. Entries live 30 seconds and are used once. It's skipped when the user has data saver on, and in browsers without the Navigation API (nothing would ever read that cache there).

Three rules keep that head start from turning into congestion, because a pointer travelling down a menu crosses every link above the one it is going to:

- **Intent, not contact.** A link is warmed once the pointer has rested on it for ~60 ms. Links merely crossed on the way cost nothing.
- **Warmed below the live page.** Prefetches are issued at low priority, so they never outrank what the page you are actually on is still loading.
- **The click wins.** Starting a navigation aborts every warm-up for anywhere else. The clicked page cannot be promoted — it is being read from a request that began as a low-priority prefetch — so the only way to hand it the connection is to stop the others.

**Speculation rules — for the links the browser navigates itself.** Janux emits a [`<script type="speculationrules">`](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) on every page, prefetching internal URLs with `moderate` eagerness. Its cache only applies to full document navigations, never to a `fetch()`, so once `boot()` installs interception the script is rewritten to cover only `[data-native]` links — otherwise Chrome would speculate documents the SPA path never uses, and hover would fetch the page twice. Pages with no islands keep the document-wide rules: every navigation away from them is a real document load, which is exactly the case the API is for.

Both are configured in `janux.config.ts`:

```ts
import { defineConfig } from 'janux';

export default defineConfig({
  navigation: {
    spa: true,                    // SPA navigation (default: true)
    prefetch: { ttl: 60_000 },    // or `false` to stop hover-prefetching
    speculationRules: {
      eagerness: 'moderate',      // 'conservative' | 'moderate' | 'eager'
      exclude: ['/logout', '/checkout/*'],
    },
  },
});
```

| Option | Default | What it does |
|---|---|---|
| `spa` | `true` | Intercept navigations and diff the next page. `false` leaves every link to the browser |
| `prefetch` | `true` | Hover-warm the page a link points at. `{ ttl }` in ms, or `false` |
| `speculationRules` | `true` | Emit the rules script. `false` omits it; `{ eagerness, exclude }` tunes it |

`exclude` is what keeps a speculative GET away from URLs with side effects — sign-out links, one-time tokens, anything that charges or consumes something. The server can also spot these requests by their `Sec-Purpose: prefetch` header.

Support is uneven (Chromium ships it; Safari and Firefox don't yet), which costs nothing: browsers that don't understand the script ignore it, and the ones without a Navigation API are the ones the rules help most.

To turn SPA navigation off for a single app without touching the config, `boot()` still wins:

```ts
boot({ defs: [...], navigation: false });        // disable SPA navigation entirely
```

## Programmatic and agent navigation

`janux.navigate(url)` navigates from code — and it's the same call agents use, so a copilot can move the user between pages as part of a task:

```ts
await window.janux.navigate('/orders/8821');
```

Navigating to the URL you are already on resolves immediately without doing anything — the same no-op contract as clicking the current page's own link, so an agent asked to "open" the page it is on succeeds instead of reloading it.

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
