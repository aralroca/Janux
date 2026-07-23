# Architecture and roadmap

The design source of truth is [RFC 0001](https://github.com/aralroca/Janux/issues/1) — section references like "RFC §5.1" throughout the docs and code point there.

## Monorepo packages

| Package | Responsibility |
|---|---|
| `janux` | Core: schema types, signals, reactive state (mutation gate), component/store runtime (intents, guards, effects, sources, events, `settled`), server renderer with islands, manifest builder, client resume runtime + gui-agent bridge |
| `@janux/server` | `api()` RPC, file-system router, HTML shell (0-JS guarantee), `/_janux/*` endpoints, proposals, `llms.txt` index, Web Bot Auth (RFC 9421) agent identity |
| `@janux/agent` | Model resolution (zero config), Anthropic/OpenAI/Google providers, the ui/api tool loop |
| `@janux/vite` | Vite plugin: JSX config, SSR bridge, api client stubs via **SWC** |
| `@janux/cli` | `janux dev/build/start/verify/eval`; `output: "static"` prerender |
| `create-janux` | App scaffolder |

## Design invariants

1. **The mounted component tree IS the agent surface.** Nothing agent-facing is written twice; drift is structurally impossible.
2. **State is schema-typed plain data.** This one constraint powers serialization, resume, diffing, the resource projection and validation.
3. **Behavior is named.** Intents/effects/sources are declared sections, never anonymous closures — so the manifest can describe them and the runtime can await them.
4. **Guards are enforced at the invocation pipeline**, not in app code. Same pipeline for clicks, bridge calls and HTTP.

## Current implementation notes (v0.1 — honest deviations from the RFC)

- **Rendering:** views re-render per island on signal change and morph the DOM in place. The RFC's compile-time binding maps (path-level DOM writes, per-intent code splitting) are the planned compiler evolution — the public contract does not change.
- **Agent runtime:** provider-direct loop (Anthropic/OpenAI/Google over fetch). The RFC's embedded Mastra harness (memory, workflows, observability exporters) is roadmap; `defineAgent`'s surface is forward-compatible with it.
- **Foreign-UI interop** ships for React (`janux/interop`, see [the guide](/docs/guide/interop)); Vue/other runtimes and reverse interop (Janux inside a React tree) are specified in the RFC and not yet implemented. **Proposal mode with visual state diff** is also still RFC-only.
- **Routing:** full segment grammar (typed matchers, catch-all, optional catch-all), nested `_layout` chains, `(group)` directories, deterministic route-sort and request middleware all ship. Parallel routes (`@slot`) and intercepting routes (`(.)`) from the RFC are **not** implemented — URL-addressable modals are covered today by query-string state (the pattern mature consoles already use); named-slot routing lands only if a migration needs it.
- **Data & state:** the client cache (`useQuery`/`mutation`/`QueryClient` with staleTime/gcTime, invalidation, optimistic rollback, per-request SSR client), persisted stores (`persist: 'local'` + `persistStore`) and typed URL state (`urlState`, shallow query-only updates) ship. Full streaming dehydrate/hydrate of in-flight queries into the SSR payload is the next increment (today SSR uses a fresh per-request client and the client re-fetches on mount).
- **Known perf limitation:** the reactive-state path-version map grows with every distinct path ever read and scans keys on writes. Fine for UI-sized state; a long-lived store holding a very large, high-churn list will pay O(paths) per mutation. Path pruning is planned alongside the binding-map compiler.

## Testing

The framework is developed test-first with `bun:test` + happy-dom (~140 tests):

- Resume-without-hydration is asserted (zero component code until interaction).
- Guard semantics (auto/confirm/forbidden × human/agent) are covered at every layer: instance, HTTP, bridge, agent loop.
- The SWC stub transform is tested to never leak server code client-side.

Run everything with `bun test packages` at the repo root.
