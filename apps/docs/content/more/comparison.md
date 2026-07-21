# Comparison

Where Janux sits relative to the tools you already know. Every framework here is excellent at what it optimizes for — none of them optimizes for agents.

| | React/Next | Qwik | Astro | HTMX | CopilotKit et al. | **Janux** |
|---|---|---|---|---|---|---|
| Agent surface | none | none | none | none | chat UI over an opaque app | **manifest generated from components** |
| Startup JS | hydration replay | resume (QRLs) | islands hydrate | ~14 KB lib | React + SDK | **resume from JSON snapshots** |
| Serialized in HTML | props | state + closures | props | — | — | **state only (schema-enforced)** |
| Static page cost | runtime | ~1 KB loader | 0 KB | 0 KB | — | **0 KB** |
| Human-in-the-loop | DIY | DIY | DIY | DIY | per-integration | **`guard: 'confirm'` keyword** |
| Server functions | server actions | server$ | actions | endpoints | — | **api() = endpoint + stub + agent tool** |
| Agent-testability | E2E + sleeps | E2E + sleeps | E2E | E2E | — | **`settled()` + `createInstance` unit tests** |

## The one-sentence versions

- **vs React/Next** — React made views declarative but left effects opaque and agents out entirely. Janux declares the component's whole life (state, effects, sources, intents) so both the runtime and the agent can reason about it.
- **vs Qwik** — same resumability goal, different price. Qwik serializes closures (QRLs, `$` boundaries); Janux constrains state to schema-typed JSON and behavior to named sections, so there's nothing to serialize but data.
- **vs Astro** — Astro perfected content sites with islands; its islands are opaque by design. Janux islands carry a second face: every island is also a resource + tools.
- **vs HTMX** — shared spirit (server-first, HTML over the wire, minimal JS) — plus typed contracts, guards and an agent surface HTMX has no vocabulary for.
- **vs CopilotKit / assistant-ui** — those add a copilot *next to* your app and you hand-write the tools. In Janux the copilot's tools **are** your components; there is no second artifact to keep in sync.

## When NOT to use Janux

Honesty section: heavy canvas/WebGL apps, native mobile, or teams deeply invested in an existing React design system today (adapters are on the [roadmap](/docs/guide/architecture-and-roadmap)). And it's a v0.x: the contract is stable by design, the implementation is young.
