---
title: Core API
description: "Everything importable from the core package: the component and store factories, the schema builders, the signals, the renderer and the config helpers."
---

# Core API

Everything importable from `janux`.

## component(def)

Defines a bifacial component. Returns a frozen `ComponentDef`.

| Key | Type | Notes |
|---|---|---|
| `name` | `string` (kebab-case, required) | Resource uri becomes `ui://<name>` |
| `description` | `string` | Shown to agents in the manifest — write it for them |
| `state` | `schema({...})` | Serializable by construction; powers snapshots & resume |
| `derived` | `Record<string, (state) => unknown>` | Computed values, cached reactively |
| `sources` | `Record<string, source(...)>` | Declarative async data-in |
| `effects` | `Record<string, effect(...)>` | Named side effects with declared triggers |
| `intents` | `Record<string, intent(...)>` | The tools; also the click handlers |
| `emits` | `Record<string, schema>` | Typed events this component may emit |
| `on` | `Record<string, (bag) => void>` | Event subscriptions (component, store or server events) |
| `lifecycle` | `{ attach?, detach? }` | Mount = publish capabilities; detach awaits cleanup |
| `use` | `Record<string, StoreDef>` | Declared store dependencies |
| `view` | `(bag) => JSX` (required) | The human face — agents never see it |

The `bag` passed to `view`, `run`, `ready`, lifecycle and `on` handlers:

```txt
{ state, derived, sources, intents, use, emit, ctx, input?, event? }
```

### Island props

An island is not a function of props the way a [static component](/docs/guide/components) is — its `view` receives the `bag`, never a props object. The renderer recognizes a **fixed, closed set** of attributes at the call site; everything else is ignored:

| Prop | Type | Effect |
|---|---|---|
| `key` | `string` | Identity of this instance — the `#<key>` suffix in `ui://<name>#<key>`. As a JSX `key` it also re-keys the island (`<Cart key={locale} />` remounts on change). |
| `id` | `string` | Alternative identity when you're not using JSX `key`. `key` wins if both are set. |
| `initial` | matches `state` schema | Seeds this instance's state (validated against `state`). SSR `initialState` for the same uri wins over it; when neither is given, [`buildDefault(state)`](/docs/reference/schema-api#builddefaulttype) boots it. |
| `persist` | boolean | Keep the live instance across SPA navigations (`data-jx-persist`). |
| `eager` | boolean | Mount on load/navigation without waiting for interaction (`data-jx-eager`). |

```tsx
<Cart key="checkout" initial={{ items: [] }} persist />
```

There is **no arbitrary prop drilling into an island**: passing data down means seeding `initial`, or sharing it through a [store](/docs/guide/stores) (`use`) or [cross-island events](/docs/recipes/cross-island-events) (`emits`/`on`) — the same JSON-serializable channels the agent surface and resume rely on. Static components above the island still drill props normally.

> **Caveat:** `ComponentTag` carries a phantom `(props?) => JanuxNode` call signature so TSX accepts `<Cart />` as an element. It is intentionally loose: `<Cart anything={x} />` type-checks, but any attribute outside the table above is silently dropped at runtime. If a value must reach the island, it goes through `initial`, a store or an event — not a prop.

## store(def)

Same as `component` minus `view`. Projects as `store://<name>`. `scope: 'app' | 'route'` (default `'app'`).

## intent(def)

| Key | Type | Notes |
|---|---|---|
| `description` | `string` | The agent reads this — make it actionable |
| `input` | `schema({...})` | Validated before `run`; errors carry paths |
| `coerce` | `'form'` | Form strings become what `input` means before validating: numbers via `Number` (blank stays invalid), checkboxes `'on'`/absent → `true`/`false`, `money()` never scaled. Typed input passes through — one schema, both faces ([forms](/docs/recipes/forms)) |
| `guard` | `'auto' \| 'confirm' \| 'forbidden'` or `({ ctx }) => guard` | Default `'auto'` |
| `scopes` | `string[]` | Every one of them must be in the caller's grant. Out of scope ⇒ absent from the manifest **and** refused by the pipeline, whatever the origin claims ([auth and context](/docs/recipes/auth-and-context)) |
| `ready` | `(bag) => boolean` | Announced in the manifest; not-ready calls throw `not_ready` |
| `glowTarget` | `(bag) => string \| undefined` | CSS selector for the DOM this intent's effect lands on |
| `run` | `(bag) => unknown` (required) | The only place `state` may be mutated |

Invocation results for agent-origin calls with `guard: 'confirm'` are proposals: `{ status: 'proposal', id, tool, input }`.

`glowTarget` exists for intents that **create** DOM: a node the view renders a tick later has no delegation marker to highlight, and the element does not exist when the call starts. Declare where the effect lands and the resolved selector rides the `janux:tool-call` event, so the feedback layer waits for it to mount:

```ts
addStep: intent({
  input: schema({ label: str() }),
  // Resolved after `run`, so post-run state is available.
  glowTarget: ({ state }) => `.react-flow__node[data-id="${state.nodes.at(-1).id}"]`,
  run: ({ state, input }) => state.nodes.push({ id: `wf-${state.nodes.length}`, label: input.label }),
}),
```

It never affects the call: a resolver that throws reports on `janux:error` and the mutation stands. Proposals carry no target — nothing ran yet. The `start` event of such a call carries `glowTargetPending: true`, so a feedback layer knows not to guess a target from the view and be overridden a moment later.

## effect(def)

`{ description?, when?: (state) => slice, debounce?: '300ms', run: (bag) => cleanup | Promise }`

Runs on attach and whenever the `when` slice changes. `run` may return a cleanup function. Durations: `ms`, `s`, `m`, `h`.

## source(def) / every() / onEvent()

```ts
source({ description, query: ({ ctx }) => data, refresh: every('5m').orOn('inventory.changed') })
```

Readers expose `.value`, `.pending`, `.error`, `.refresh()`. On SSR sources load before render and their values travel in the snapshot — resumed islands never double-fetch.

## Signals (advanced)

`signal(initial)`, `computed(fn)`, `watch(fn)` (effect; returns dispose), `batch(fn)`, `untrack(fn)`. You rarely need these directly — state, derived and effects cover the usual cases.

**Ownership tree**: `createRoot(fn)` runs `fn(dispose)` inside a disposal scope — effects and computeds created within register automatically and are cleaned up on `dispose()` (nested roots cascade with their parent). `onCleanup(fn)` registers an arbitrary cleanup in the current scope; `getOwner()` / `runWithOwner(owner, fn)` move work between scopes (e.g. async continuations). This is the primitive behind island teardown and foreign-framework roots.

## createInstance(def, options) (advanced)

The runtime beneath islands — also your unit-testing entry point. See the [Testing recipe](/docs/recipes/testing-components).

```ts
const cart = createInstance(Cart, { initial, ctx, bus, stores, onAudit, onProposal });
await cart.attach();          // starts sources, effects, lifecycle
await cart.intents.addItem({ productId: 'p1' });          // human origin
await cart.intents.addItem({ productId: 'p1' }, { origin: 'agent' });
await cart.settled();
cart.snapshot();              // plain JSON state
cart.resource();              // the agent projection
await cart.dispose();
```

## Low-level exports (advanced)

These come out of `janux` too. You rarely import them directly — the CLI, the Vite plugin and [`@janux/server`](/docs/reference/server-api) wire them for you — but they're the seams for embedding Janux, testing, or building your own server.

### renderToString(node, options?)

Renders a page (or any node) to HTML on the server. Returns a `RenderResult`:

```ts
const { html, registry, snapshots, i18nKeys } = await renderToString(<ShopPage />, { ctx });
```

| Field | Meaning |
|---|---|
| `html` | The rendered markup |
| `registry` | The mounted islands + stores discovered during render |
| `snapshots` | Per-island state snapshots (`{ uri, state }`) — what the client resumes from, no hydration replay |
| `i18nKeys` | Exactly the i18n keys the page's islands resolved, so the page ships only those messages |

`options` accepts `{ ctx, bus, storeDefs, initialState }` — the same wiring `createJanuxServer` supplies per request (`initialState` reseeds islands by uri when resuming).

### renderToStream(node, options?)

The same render, handed over as it is produced instead of after the last island resolves. This is what `createJanuxServer` serves pages with — see [SSR and resumability](/docs/guide/ssr-and-resumability#streaming).

```ts
const { chunks, done } = renderToStream(<ShopPage />, { ctx });

for await (const chunk of chunks) process.stdout.write(chunk);
const { snapshots, registry, i18nKeys } = await done;   // only after chunks is drained
```

Same `options` as `renderToString`, and the joined chunks are byte-identical to its `html`. Islands still load their sources in parallel — a slow one holds back its own children, not the page — and the snapshots only exist once the render finished, which is why they arrive through `done` rather than up front.

The third field, `cancel()`, is for a response the client abandoned mid-stream: it stops the renderer from descending into new island work and settles `done` with what rendered. Call it from your stream's `cancel` hook — the generator protocol alone can't reach a renderer parked on its own `await`.

### speculationRules(config, options?)

The JSON behind the `<script type="speculationrules">` the shell emits, exported so a custom server can build its own. `config` is the `navigation.speculationRules` value (`true`, `false`, or `{ eagerness, exclude }`); pass `{ nativeOnly: true }` for the narrowed form the client swaps in once it intercepts navigations. `SPECULATION_SCRIPT_ID` and `CONFIG_SCRIPT_ID` are the script ids both sides agree on — the second one is where the shell ships the `navigation` config for the client to read back. See [Navigation](/docs/guide/navigation#prefetching-and-speculation-rules).

### buildManifest(entries, ctx?)

Builds the agent-facing manifest for a set of mounted defs — the projection external MCP clients and `GET /_janux/manifest` consume:

```ts
const manifest = buildManifest([{ def: Cart, key: 'default', instance }], ctx);
// { janux: '0.1', resources: [...], tools: [...], events: [...] }
```

`resources` are the `ui://`/`store://` snapshots (with JSON Schema for typed state), `tools` are the non-`forbidden` intents (guard, input schema, `ready`), `events` are the union of every `emits` key. Passing `instance` is what makes a tool's projection *live*: `ready` is evaluated against it, and so is any input field declaring [`options()`](/docs/reference/schema-api#optionsresolve), whose currently-valid values are published as that property's `enum`. `resolveGuard(def, ctx)` is the same helper it uses to collapse function guards to a concrete `'auto' | 'confirm' | 'forbidden'`.

### createBus()

The typed event bus that carries component, store and server events. One is created per request/client; you only construct your own for tests or a custom runtime.

```ts
const bus = createBus();
const off = bus.on('inventory.changed', (payload) => { /* ... */ });
bus.emit('inventory.changed', { sku: 'p1' });
off();
```

### JanuxIntentError

Thrown by intent dispatch when a call is refused. `error.code` is one of `'forbidden' | 'not_ready' | 'invalid_input' | 'unknown_intent'` — the same codes the HTTP layer maps to 4xx envelopes.

### AuditEntry / Proposal

The shapes the `onAudit` and `onProposal` hooks receive:

```ts
type AuditEntry = { tool: string; origin: 'human' | 'agent'; guard: GuardValue;
                    input: unknown; ok: boolean; error?: string; at: number; agent?: string };
type Proposal   = { id: string; tool: string; input: unknown; execute: () => Promise<unknown> };
```

`AuditEntry.agent` is the verified Web Bot Auth key id, present only for authenticated external agents. A `Proposal` is what a `confirm` guard produces; `execute()` runs it exactly once (the `/_janux/approve` endpoint calls it for you).

### grantedScopes(ctx) / allowsScopes(ctx, required?)

The scope arithmetic the invocation pipeline runs, exported because an app sometimes needs the same answer outside a tool (rendering a menu, say — never as the enforcement point, which is invariant 4's job).

```ts
grantedScopes({ scopes: ['orders:read', 'orders:write'], agent: { scopes: ['orders:read'] } });  // ['orders:read']
allowsScopes({ scopes: ['orders:read'] }, ['orders:write']);                                     // false
```

`ctx.scopes` is what the caller's credential grants — absent means **none**, so a tool that declares `scopes` is unreachable until the app grants them. `ctx.agent.scopes` narrows that: the effective grant is the intersection, so an agent can never out-rank the session it acts for. A tool that declares no scopes is never affected. See the [auth recipe](/docs/recipes/auth-and-context).

### notFound() / isNotFoundError(error)

`notFound()` ends a page's render and answers the request with the app's [`_404.tsx`](/docs/guide/navigation) page, under a `404`. It never returns (`never`), so the code after it is unreachable and TypeScript narrows accordingly:

```tsx
import { notFound } from 'janux';
import { postBySlug } from '../../content';

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  if (!post) notFound();

  return <article>{post.title}</article>;
}
```

Call it from the route module (or something it awaits): once the document starts streaming the status line is already sent. `isNotFoundError(error)` recognizes the signal, for a [custom server](/docs/recipes/custom-server) that wraps `server.fetch` and wants to answer a `notFound()` its own way.

### redirect(location, status?) / redirectTarget(error)

`notFound()`'s sibling: a route that knows its content lives elsewhere answers with a `Location` header instead of rendering something else under the old URL. The status is a `RedirectStatus` (`301 | 302 | 307 | 308`), default `307` — temporary, and the method survives. Like `notFound()` it throws and never returns:

```tsx
import { redirect } from 'janux';
import { parseConversionSlug } from './conversions';

export default function Page({ params }: { params: { conversion: string } }) {
  if (!parseConversionSlug(params.conversion)) redirect('/convert/png-to-webp');

  return <Converter slug={params.conversion} />;
}
```

Use the declarative [`redirects`](/docs/reference/server-api) in `janux.config.ts` for URL-to-URL moves the router can decide alone; `redirect()` is for the moves only the route's own logic can decide (a retired slug, a row that changed owner). `redirectTarget(error)` reads the signal back — `{ location, status }`, or `undefined` when the error is something else — for a custom server wrapping `server.fetch`.

### parseDuration(input)

Parses the duration strings used by `every()` and `effect({ debounce })` into milliseconds — `'300ms'`, `'2s'`, `'5m'`, `'1h'`. Throws on anything else. Exposed mostly so custom refresh/debounce logic can share one parser.

### Image(props)

The responsive image primitive — see the [images guide](/docs/guide/images) for the whole story. `src` is a path into `public/`; `width` plus either `height` or `aspectRatio` is required, so the box is always reserved:

```tsx
import { Image } from 'janux';

export function Hero() {
  return <Image src="/photos/hero.jpg" alt="Aurora" width={1200} aspectRatio="16/9" priority />;
}
```

It renders a `<picture>` with AVIF and WebP candidates plus the original as the `<img>` fallback, and ships no client code. `sizes` defaults to `<width>px`, `priority` sets `loading="eager"` + `fetchpriority="high"`, and `unoptimized` (required for a remote `src`) links the source as-is.

### Image URL helpers

The contract `<Image>` and the build-time optimizer share. An app rarely calls these; a custom pipeline that wants to emit the same variants does.

| Export | What it is |
|---|---|
| `IMAGE_WIDTHS` | The ladder every `srcset` is drawn from: `[320, 640, 960, 1280, 1920]` |
| `IMAGE_FORMATS` | The modern formats emitted, most efficient first: `['avif', 'webp']` |
| `isOptimizable(src)` | Whether a source is a raster format worth re-encoding (`.png`, `.jpg`, `.webp`) |
| `variantUrl(src, width, format)` | `/photos/hero.jpg` + `640` + `avif` → `/_janux/image/photos/hero.jpg/640.avif` |
| `parseVariantUrl(pathname)` | The inverse, and the trust boundary with it: `undefined` for anything Janux would not itself have emitted |

### Font CSS helpers

The pure half of the [font pipeline](/docs/guide/fonts) — the part that reaches the browser. An app declares fonts in `janux.config.ts` and never calls these; a custom pipeline that wants the same output does.

| Export | What it is |
|---|---|
| `FONT_ROUTE` | Where self-hosted files live: `/_janux/font` |
| `fallbackOverrides(font, fallback)` | The `size-adjust` / `ascent-override` / `descent-override` / `line-gap-override` that make a system font occupy a webfont's space, from both fonts' real metrics |
| `fontFaceCss(fonts)` | The `@font-face` rules — real faces, the adjusted fallback, and the `--var` naming the stack |
| `fontPreloadHrefs(fonts)` | The files worth a `<link rel=preload>`, deduped |

`FontMetrics`, `FontOverrides`, `ResolvedFont` and `ResolvedFontFace` are the shapes they pass between them; `GenericFamily` is the `sans-serif | serif | monospace` a fallback is measured against.

### JSX runtime

`Fragment`, `jsx`, `jsxs` and the `JanuxNode` type are the automatic-runtime targets your `.tsx` compiles to (`jsxImportSource: 'janux'`). You import them only if you emit JSX calls by hand; normal components never touch them.
