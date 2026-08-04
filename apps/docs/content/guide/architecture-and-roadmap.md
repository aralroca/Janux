---
title: Architecture and roadmap
description: "How Janux is put together: the packages, the four design invariants behind them, what ships today and what is still planned."
---

# Architecture and roadmap

## Monorepo packages

| Package | Responsibility |
|---|---|
| `janux` | Core: schema types, signals, reactive state (mutation gate), component/store runtime (intents, guards, effects, sources, events, `settled`), server renderer with islands, manifest builder, client resume runtime + gui-agent bridge, the observability seam (`janux/observability`) |
| `@janux/server` | `api()` RPC, file-system router, HTML shell (0-JS guarantee), `/_janux/*` endpoints, proposals, skills discovery (`src/skills/**`), `llms.txt` index, Web Bot Auth agent identity |
| `@janux/content` | Content collections: frontmatter validated by the core schema, Markdown/MDX bodies compiled to Janux components on the server |
| `@janux/agent` | Model resolution (Anthropic/OpenAI/Google/OpenRouter), the ui/api tool loop, and the embedded harness: memory (in-memory + Postgres), durable workflows, guardrail processors, rate limiting (in-memory + Redis), attachments, outbound MCP client |
| `@janux/vite` | Vite plugin: JSX config, SSR bridge, api client stubs via **SWC** |
| `@janux/cli` | `janux dev/build/start/verify/eval`; `output: "static"` prerender; the [adapter API](/docs/recipes/adapters) deploy targets implement |
| `@janux/node`, `@janux/vercel` | Deployment adapters. Each declares its capabilities, so a target that cannot hold a WebSocket open says so at build time |
| `@janux/testing` | Route/page harness, `api()` mocks and the settled-based Playwright fixtures |
| `create-janux` | App scaffolder |

## Design invariants

1. **The mounted component tree IS the agent surface.** Nothing agent-facing is written twice; drift is structurally impossible.
2. **State is schema-typed plain data.** This one constraint powers serialization, resume, diffing, the resource projection and validation.
3. **Behavior is named.** Intents/effects/sources are declared sections, never anonymous closures — so the manifest can describe them and the runtime can await them.
4. **Guards are enforced at the invocation pipeline**, not in app code. Same pipeline for clicks, bridge calls and HTTP.

## What ships today

Everything the two core app archetypes (a content site and a full console) need is implemented and tested:

- **Reactivity & events:** nested islands (stateful-in-stateful), ownership tree, rich delegated events, controlled inputs, and **path-pruned** reactive state (the old O(paths)-per-write limit is gone — descendant notification is indexed and unread paths are reclaimed).
- **Foreign-UI interop:** `janux/interop` mounts React components unchanged as real embedded roots, with a tracked props bridge and events→intents (see [the guide](/docs/guide/interop)).
- **Routing:** full segment grammar (typed matchers, catch-all, optional catch-all), nested `_layout` chains, `(group)` directories, deterministic route-sort, request middleware, per-entry scroll restoration (streaming-safe) and shallow routing (`data-shallow`).
- **Data & state:** client cache (`useQuery`/`mutation`/`QueryClient`, optimistic rollback, per-request SSR client), persisted stores, typed URL state.
- **Query hydration:** what SSR fetched travels in the response and the client resumes on top of it — no refetch on mount; a query still in flight when the shell goes out is announced and delivered on the same stream.
- **HTTP cache:** per-route `cachePolicy` (`max-age`/`s-maxage`/`stale-while-revalidate`, private by default), on-demand `revalidateTag`/`revalidatePath`, cache tags for the CDN in front and a bounded shared response cache behind — one `staleTime`/`swr`/`tags` vocabulary shared with `useQuery` and `source`.
- **Platform:** arbitrary `src/api/**` HTTP handlers + multipart uploads + `dropzone`.
- **Content:** typed collections (`@janux/content`) — frontmatter validated by the same `schema()` as component state, with Markdown and MDX bodies whose islands are ordinary islands (see [the guide](/docs/guide/content-collections)).
- **Agentic surface:** hosted MCP endpoint (`/_janux/mcp`), per-page Markdown projections, proposal visual diffs, `llms.txt`, Web Bot Auth, `janux verify`/`janux eval`, and [skills](/docs/guide/skills) — filesystem procedures whose index always travels and whose body the model loads on demand, projected to MCP as resources and checked by `janux verify` against the tools the tree really has.
- **Observability:** `src/instrumentation.ts` loaded before the server serves, OpenTelemetry spans for the request, the SSR render, each island, the invocation pipeline and the agent loop (`gen_ai.*` semantic conventions, tokens and cost per turn), a global `onError`, and PII redaction on every exported attribute — fail-open throughout, and inert when unconfigured (see [the reference](/docs/reference/observability-api)).
- **Embedded harness (`@janux/agent`):** memory (in-memory + Postgres adapters), durable suspend/resume workflows, guardrail processors, rate limiting (in-memory + Redis), attachments, outbound MCP client, model routing (Anthropic/OpenAI/Google/OpenRouter).

## Roadmap

- **Rendering:** views still re-render per island + DOM morph; compile-time binding maps (path-level DOM writes, per-intent code splitting) are the planned compiler evolution — the public contract does not change.
- **Routing:** parallel routes (`@slot`) and intercepting routes (`(.)`) — URL-addressable modals are covered today by query-string state.
- **Interop:** Vue/other runtimes and reverse interop (Janux inside a foreign tree).

## Deliberately out of scope

**A UI component library.** Janux ships no design system and no headless primitives, and none are planned: the maintained surface is `foreign()`, which mounts the React ecosystem unchanged. The reasoning and the recipe are on the [design system page](/docs/guide/design-system).

## Testing

The framework is developed test-first with `bun:test` + happy-dom (11055 tests, the count `bun run test:census` measures and enforces):

- Resume-without-hydration is asserted (zero component code until interaction).
- Guard semantics (auto/confirm/forbidden × human/agent) are covered at every layer: instance, HTTP, bridge, agent loop.
- The SWC stub transform is tested to never leak server code client-side.
- Apps test at three levels with the same package a user gets ([`@janux/testing`](/docs/recipes/testing-components)): the e2e suite drives the public harness, not an internal fork of it.

Run everything with `bun test packages` at the repo root.

CI runs that suite on Linux, Windows and macOS, and on both ends of the supported Bun range — the floor `engines` declares as well as the latest release, because a floor nothing exercises is not a claim. The browser end-to-end suite runs the same cases on Chromium, Firefox and WebKit. Nothing in the framework is known to be degraded on any of them; where an engine differs it has been in the automation driver rather than the engine, and those cases are written up in `CONTRIBUTING.md` so the next author does not rediscover them.
