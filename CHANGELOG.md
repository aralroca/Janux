# Changelog

What changed in each release of Janux, newest first. Every published package moves on one version — see
[VERSIONING.md](./VERSIONING.md) — so this file is the whole framework, and the per-package files under
`packages/*/CHANGELOG.md` are the same notes narrowed to one package.

From the next release onwards this file is generated: the entries come from the changesets each pull request ships
with, folded together by `bun run release:version`. The sections below were reconstructed from the commit history
when release engineering was introduced, which is why they are coarser than what follows will be. Releases before
0.4.0 predate the changelog entirely; `git log 0.3.2..0.4.0` is the honest answer for those.

Janux is 0.x, so a **minor is the breaking bump**. Breaking changes are called out as such below.

## 0.6.0

### janux

#### Minor Changes

- `foreign()` maps React callback props onto intents, keeps portals alive across a navigation, and hands React plain
  data so a foreign component cannot capture a live state proxy. State identity is stable across re-renders, which is
  what data grids, charts and virtualization libraries assume.
- Hovering a link warms the route manifest as well as the page, so the first navigation after a hover no longer waits
  on a manifest fetch. Prefetching waits 60ms for intent, requests at low priority, and aborts when a navigation
  starts, so a pointer crossing a nav bar no longer costs a request per link.
- Strict CSP: `csp: true` mints a nonce per request and stamps it on every inline script and style the framework
  emits — resume payload, island map, runtime, speculation rules, query hydration, suspense boundary swaps, inlined
  CSS, JSON-LD, `meta.head` and `<script>`/`<style>` written in JSX — then sends
  `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. No code path uses `eval` or
  `new Function`, so `'unsafe-eval'` is never needed, and an app that does not configure `csp` gets byte-identical
  HTML.

  SPA navigation is where this is easy to get wrong: re-creating the scripts a navigated page brings is what gives
  them a valid nonce, so doing it indiscriminately would launder an injected `<script>` into an executed one. The
  response states its own nonce in `x-janux-nonce`, out of reach of its own markup, and only tags already carrying
  that value are re-stamped. Nonces are validated against the CSP `base64-value` grammar, and a nonced document is
  never kept in the shared response cache — a stored nonce is one every later visitor would share.

- `worker()` — a new `janux/worker` entry point that runs a function on a Web Worker thread, so expensive work stops
  blocking clicks, typing, scrolling and animation. It is marked **experimental** in `STABILITY.md`: the worker is
  emitted by a source transform because Vite cannot emit a worker chunk from a plugin, and that strategy is expected
  to change under the API.

#### Patch Changes

- `janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
  `_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
  it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
  previously never reached. The overlay is dev-only and eliminated from production builds.

  Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
  files exist for an error tracker without a `sourceMappingURL` reaching the browser.

  `janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
  route as markdown to paste into an issue unedited.

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

### @janux/server

#### Minor Changes

- A multipart body no longer has to fit in memory: `spoolMultipart()` streams parts to disk as they arrive, enforcing
  the size limit inside the read loop rather than after it. A 4 GB upload now peaks at ~71 MB of RSS instead of
  holding the whole body.
- Strict CSP: `csp: true` mints a nonce per request and stamps it on every inline script and style the framework
  emits — resume payload, island map, runtime, speculation rules, query hydration, suspense boundary swaps, inlined
  CSS, JSON-LD, `meta.head` and `<script>`/`<style>` written in JSX — then sends
  `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. No code path uses `eval` or
  `new Function`, so `'unsafe-eval'` is never needed, and an app that does not configure `csp` gets byte-identical
  HTML.

  SPA navigation is where this is easy to get wrong: re-creating the scripts a navigated page brings is what gives
  them a valid nonce, so doing it indiscriminately would launder an injected `<script>` into an executed one. The
  response states its own nonce in `x-janux-nonce`, out of reach of its own markup, and only tags already carrying
  that value are re-stamped. Nonces are validated against the CSP `base64-value` grammar, and a nonced document is
  never kept in the shared response cache — a stored nonce is one every later visitor would share.

#### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

### @janux/agent

#### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

### @janux/content

#### Minor Changes

- Released with the rest of the workspace.

  `PUBLISH_ORDER` publishes ten packages and `scripts/version.ts` requires the
  ten to agree on one version, but the `fixed` group in `.changeset/config.json`
  still named the eight that existed when it was written — so nothing bumped
  these two along and the release refused to cut. Both are in the group now,
  and every package added from here has to join it.

### @janux/vite

#### Minor Changes

- `worker()` — a new `janux/worker` entry point that runs a function on a Web Worker thread, so expensive work stops
  blocking clicks, typing, scrolling and animation. It is marked **experimental** in `STABILITY.md`: the worker is
  emitted by a source transform because Vite cannot emit a worker chunk from a plugin, and that strategy is expected
  to change under the API.

#### Patch Changes

- `janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
  `_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
  it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
  previously never reached. The overlay is dev-only and eliminated from production builds.

  Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
  files exist for an error tracker without a `sourceMappingURL` reaching the browser.

  `janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
  route as markdown to paste into an issue unedited.

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- Strict CSP: `csp: true` mints a nonce per request and stamps it on every inline script and style the framework
  emits — resume payload, island map, runtime, speculation rules, query hydration, suspense boundary swaps, inlined
  CSS, JSON-LD, `meta.head` and `<script>`/`<style>` written in JSX — then sends
  `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. No code path uses `eval` or
  `new Function`, so `'unsafe-eval'` is never needed, and an app that does not configure `csp` gets byte-identical
  HTML.

  SPA navigation is where this is easy to get wrong: re-creating the scripts a navigated page brings is what gives
  them a valid nonce, so doing it indiscriminately would launder an injected `<script>` into an executed one. The
  response states its own nonce in `x-janux-nonce`, out of reach of its own markup, and only tags already carrying
  that value are re-stamped. Nonces are validated against the CSP `base64-value` grammar, and a nonced document is
  never kept in the shared response cache — a stored nonce is one every later visitor would share.

### @janux/tailwind

#### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

### @janux/cli

#### Patch Changes

- `janux dev` shows a failure inside an `intent()`, `effect()` or `source()` with the chain that explains it — route,
  `_layout` chain, island, the named behavior, and, for an invocation, the guard the pipeline resolved and the origin
  it resolved it for — above the JS stack. The original error is still logged to the console, which a failed intent
  previously never reached. The overlay is dev-only and eliminated from production builds.

  Sourcemaps are on: full in dev, with the framework's own frames resolvable, and `hidden` in production, so `.map`
  files exist for an error tracker without a `sourceMappingURL` reaching the browser.

  `janux info` prints versions, the resolved config, detected adapters, active zero-config integrations and every
  route as markdown to paste into an issue unedited.

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.
- The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
  `POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
  and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
  have let the real attack through.

### @janux/vercel

#### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

### @janux/node

#### Minor Changes

- Released with the rest of the workspace.

  `PUBLISH_ORDER` publishes ten packages and `scripts/version.ts` requires the
  ten to agree on one version, but the `fixed` group in `.changeset/config.json`
  still named the eight that existed when it was written — so nothing bumped
  these two along and the release refused to cut. Both are in the group now,
  and every package added from here has to join it.

### create-janux

#### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

## 0.5.0

### janux

#### Minor Changes

- **Breaking: `on=` and `intent=` are gone.** Events bind by name — `onClick`, `onSubmit`, `on<Event>` — which
  generalizes the old marker rule to any event instead of an allowlist. Every call site has to be migrated.
- `intents.x.with(input)` returns a bound ref that renders its own `data-input`.
- Typed JSX: `style` accepts a `CSSProperties` object (csstype), every HTML and SVG element is typed per tag,
  `IntentRef` reserves the `on*` namespace, and passing a closure to a handler now fails at compile time.
- Declarative drag & drop: binding `onDrop` enables the zone.
- Streaming suspense and error boundaries in `component()`, with mid-stream boot, navigation epochs and late
  snapshots on the client.
- `run()` and dynamic guards can see the caller's origin (human or agent).
- Intents opt into form coercion, so one typed schema serves both faces.
- Def-level config objects reach `persistStore()`.

#### Patch Changes

- Keyed child reconciliation in `morph`, a JSX-against-DOM reconciler for the island render loop, and intent runs
  batched into one reactive flush per body.
- Unbounded retention under sustained SSR: the coalescer is a push pump now.
- A navigation to the current URL is cancelled rather than handed back to the browser.
- The end-of-chunk sentinel is keyed — navigations into a suspense page went empty without it.
- The boolean-token branch no longer bypasses the attribute-name guard.

### @janux/server

#### Minor Changes

- The HTML shell splits around pending suspense boundaries.
- The invocation pipeline carries the caller's origin, for both intents and `api()`.
- MCP specification 2026-07-28, served alongside the previous era.

#### Patch Changes

- `tools/list` serves JSON Schema instead of the internal `JxType`.
- Native enter/leave semantics, bubble-phase suppression and capture-phase delegation for rich events.
- `approve`/`reject` refuse agent callers; approved runs keep the agent origin in the audit trail.

### @janux/agent

#### Minor Changes

- MCP specification 2026-07-28: the outbound client speaks the new era first and falls back to the old one.

### @janux/vite

#### Patch Changes

- Suspense-only pages ship their runtime: the build catalogs islands instead of inferring them from components.

### @janux/cli

#### Minor Changes

- `output: "static"` emits the Markdown projection next to every page.

#### Patch Changes

- Suspense-only pages ship their runtime.

### create-janux

#### Minor Changes

- The scaffolded app uses `on*` handlers and `.with()`, matching the 0.5.0 event syntax.

## 0.4.0

### janux

#### Minor Changes

- `renderToStream()`: HTML flushes as it renders, and siblings still render in parallel.
- Prefetch and speculation rules are configurable from `janux.config.ts`.

#### Patch Changes

- A superseded navigation aborts its page stream, and dropping a persisted island warns instead of failing silently.
- Speculation rules are re-narrowed after every navigation.
- `diff-dom-streaming` 0.6.8.

### @janux/server

#### Minor Changes

- Pages stream: the prelude flushes before the render and the epilogue after it.
- Serves the prefetch and speculation configuration.

### @janux/vite

#### Patch Changes

- The response body is piped to Node instead of buffered.
