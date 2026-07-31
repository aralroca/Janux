---
title: Client runtime internals
description: "The seams underneath the client entry point: exports for embedding Janux in another shell, driving it from a test, or building devtools."
---

# Client runtime internals

[`boot()`](/docs/reference/client-api) wires all of this for you. These exports from `janux/client` are the seams — for embedding Janux in another shell, driving it from a test, or building devtools. If you're building an app, you don't need this page.

```ts
import {
  createClientRegistry, registerDef, mountIsland, mountEagerIslands,
  performNavigation, prefetch, createBridge, morph, toDomNodes,
} from 'janux/client';
```

## The registry

`createClientRegistry(): ClientRegistry` — the client's whole world, one object of maps:

| Field | Holds |
|---|---|
| `defs` / `foreignDefs` | Definitions by name, from `boot({ defs })` |
| `loaders` | Lazy island loaders, so code arrives on first interaction |
| `mounted` / `foreigns` | Live instances by island id (`counter#left`) |
| `mounting` | **In-flight** mounts, so a double click or an unbatched write share one instance instead of racing two |
| `stores` | Live store instances by name |
| `snapshots` | Serialized state parsed from the page, keyed by `ui://` / `store://` URI |

`registerDef(registry, def)` files a definition in the right map — component or `foreign` — dispatching on `def.kind`.

## Mounting

`mountIsland(id, node, mount): Promise<JanuxInstance>` resumes one island: it resolves the def, restores its snapshot, attaches sources/effects/lifecycle and registers the instance. Concurrent calls for the same id share the `mounting` promise.

`mountEagerIslands(mount): Promise<void>` mounts every `janux-island[data-jx-eager]` not already live. It runs on boot **and** after each navigation, which is what makes `eager` islands (editors, toast hosts, pollers) work on arrival.

`MountContext` is what every one of these takes: `{ registry, bus, ctx, inflight, onProposal, onAudit? }`. `inflight` is the promise set `settled()` awaits; `onProposal` receives `confirm`-guarded agent calls awaiting a human.

## Navigation

`performNavigation(url, mount, options?): Promise<void>` runs one SPA navigation: fetch, diff, restore persisted islands, re-index snapshots, sweep what left, mount eager islands. Navigations are serialized internally, so a superseded one finishes its cleanup before the next starts. Pass `{ signal }` to abort — an abort before the swap commits leaves the current page fully intact.

`prefetch(url): void` warms a page — and its route manifest — into a 30-second cache, at low priority. The next navigation to that URL consumes the entry, so a prefetch is never used twice or served stale; it also aborts every warm-up for anywhere else, so the page being opened gets the connection. Link hover goes through `prefetchOnHover(url)`, which waits for the pointer to settle (~60 ms) before calling this, so links merely crossed on the way down a menu are never fetched.

## The agent bridge

`createBridge(mount, proposals): JanuxBridge` builds what becomes `window.janux` — the surface a copilot, a WebMCP client or a test drives the page through:

| Method | Does |
|---|---|
| `read(uri)` | The resource projection for `ui://name` or `store://name` |
| `call(tool, input?)` | Invokes `component.intent` with agent origin (guards apply) |
| `approve(id)` / `reject(id)` | Resolves a pending proposal |
| `settled(scope?)` | Awaits in-flight work — the deterministic hook for tests and agents |
| `subscribe(event, handler)` | Bus subscription; returns unsubscribe |
| `manifest()` | The live manifest of what's mounted right now |

`manifest()` is deliberately narrow: it answers "what is mounted", which is why `ready` states in it are current. For "what does this route expose", use `appTools(bridge)` — the route manifest merged under the live one, so a tool whose island has not resumed yet is still on the table (`call()` mounts it on demand). `installWebMCP` and [`createCopilot`](/docs/recipes/local-model-copilot) both register from it.

## The navigate tool

`collectPageLinks(): PageLink[]` returns every **same-origin** link currently in the DOM as `{ path, label }` — deduped by path and capped at 100 so a link-heavy page can't blow up a tool payload. It needs no authoring: the links are whatever your JSX rendered.

`createNavigateTool(...)` builds the `ui_navigate` client tool from that list, and its behavior is deliberate:

- **Cross-origin calls are refused** and answered with the real link list, so a model that hallucinated a host self-corrects on the next turn instead of leaving your app.
- **It clicks a real anchor** when one matches, preferring a *visible* one (sidebars often repeat a link in a hidden mobile drawer) — so the agent takes exactly the path a human would.
- **It glows the link** for ~350ms before navigating, which is what makes agent navigation legible instead of a page teleporting.

Both are wired automatically when the copilot is enabled; import them when you build your own agent surface. See [the agent and your copilot](/docs/guide/agent-and-copilot).

## Rendering primitives

`toDomNodes(node, pass?): Node[]` turns JSX into real DOM nodes (strings and numbers become text; `null`, `undefined` and booleans render nothing). `morph(root, nextChildren)` reconciles `root`'s children toward `nextChildren` in place — keyed nodes are moved rather than recreated, which is how an island re-render preserves focus, scroll and DOM state. See [keys and lists](/docs/guide/keys-and-lists).

Related: [`boot()` and the client API](/docs/reference/client-api) · [Navigation](/docs/guide/navigation) · [SSR and resumability](/docs/guide/ssr-and-resumability)
