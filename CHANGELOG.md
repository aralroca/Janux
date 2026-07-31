# Changelog

What changed in each release of Janux, newest first. Every published package moves on one version — see
[VERSIONING.md](./VERSIONING.md) — so this file is the whole framework, and the per-package files under
`packages/*/CHANGELOG.md` are the same notes narrowed to one package.

From the next release onwards this file is generated: the entries come from the changesets each pull request ships
with, folded together by `bun run release:version`. The sections below were reconstructed from the commit history
when release engineering was introduced, which is why they are coarser than what follows will be. Releases before
0.4.0 predate the changelog entirely; `git log 0.3.2..0.4.0` is the honest answer for those.

Janux is 0.x, so a **minor is the breaking bump**. Breaking changes are called out as such below.

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
