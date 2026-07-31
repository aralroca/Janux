---
title: Comparison
description: Where Janux sits relative to the tools you already know. Every framework here is excellent at what it optimizes for — none of them optimizes for the Agentic Web.
---

# Comparison

Where Janux sits relative to the tools you already know. Every framework here is excellent at what it optimizes for — none of them optimizes for the [Agentic Web](/docs/getting-started/the-agentic-web). That's the axis this page adds, not a claim that the others render badly.

One framework per row, split into two matrices so neither hides a column. The paragraphs below are the part worth reading.

### Rendering & cost

| | Startup JS | Serialized in HTML | Static page cost |
|---|---|---|---|
| React / Next | hydration replay | props | runtime |
| Qwik | resume (QRLs) | state + closures | ~1 KB loader |
| Astro | islands hydrate | props | 0 KB |
| HTMX | ~14 KB lib | — | 0 KB |
| Brisa | 0 KB by default; web components hydrate | props | 0 KB |
| SvelteKit | hydration (`csr = false` opts out) | props | 0 KB with `csr = false` |
| Nuxt | hydration | props | hydration bundle |
| SolidStart | hydration (fine-grained) | props | hydration bundle |
| CopilotKit / assistant-ui | React + SDK | — | — |
| **Janux** | **resume from JSON snapshots** | **state only (schema-enforced)** | **0 KB** |

### Agent surface & server

| | Agent surface | Human-in-the-loop | Server functions | Agent-testability |
|---|---|---|---|---|
| React / Next | none | DIY | server actions | E2E + sleeps |
| Qwik | none | DIY | `server$` | E2E + sleeps |
| Astro | none | DIY | actions | E2E |
| HTMX | none | DIY | endpoints | E2E |
| Brisa | none | DIY | server actions over RPC | E2E |
| SvelteKit | none | DIY | form actions + `+server` | E2E |
| Nuxt | none | DIY | `server/api/**` (Nitro) | E2E |
| SolidStart | none | DIY | `"use server"` | E2E |
| CopilotKit / assistant-ui | chat UI over an opaque app | per-integration | — | — |
| **Janux** | **manifest from components** | **`guard: 'confirm'`** | **`api()` = endpoint + stub + tool** | **`settled()` + unit tests** |

## The one-sentence versions

- **vs React/Next** — React made views declarative but left effects opaque and agents out entirely. Janux declares the component's whole life (state, effects, sources, intents) so both the runtime and the agent can reason about it. You don't have to leave React behind to try it: [`foreign()`](/docs/reference/foreign) mounts real React components inside a Janux island.
- **vs Qwik** — same resumability goal, different price. Qwik serializes closures (QRLs, `$` boundaries); Janux constrains state to schema-typed JSON and behavior to named sections, so there's nothing to serialize but data.
- **vs Astro** — Astro perfected content sites with islands; its islands are opaque by design. Janux islands carry a second face (every island is also a resource + tools), and `output: "static"` ships to the same static hosts.
- **vs HTMX** — shared spirit (server-first, HTML over the wire, minimal JS) — plus typed contracts, guards and an agent surface HTMX has no vocabulary for.
- **vs Brisa** — the closest sibling in spirit: server-rendered JSX with zero JS by default, signal-driven islands (as native Web Components) and browser events handled on the server over a tiny RPC. Brisa optimizes for the **web platform** — Web Components, built-in i18n and routing. Janux optimizes for the **agent**: the island that renders is also a typed resource with tools, guards and an audit trail. If you want your UI to *be* the platform, Brisa; if you want it to *be* the API an agent drives, Janux.
- **vs SvelteKit** — a compiler-first reactivity model with an excellent router, form actions and even JS-free routes (`export const csr = false`). Everything an agent needs — a manifest, typed tools, approval flows — is yours to invent on top; in Janux it's the component definition.
- **vs Nuxt** — Vue's batteries-included meta-framework: Nitro server routes, data fetching, a module for everything. Same story as SvelteKit for agents, and hydration remains the default cost model rather than resumability.
- **vs SolidStart** — the reactivity closest to Janux's own signals, plus `"use server"` functions. The difference isn't the reactive model: it's that Janux **constrains** state to schema-typed JSON and behavior to named intents, which is what makes a page resumable *and* legible to a model.
- **vs CopilotKit / assistant-ui** — those add a copilot *next to* your app and you hand-write the tools. In Janux the copilot's tools **are** your components; there is no second artifact to keep in sync.

## When NOT to use Janux

Heavy canvas/WebGL apps and native mobile aren't what this optimizes for. A team deeply invested in an existing React design system, though, no longer has to choose: `foreign()` mounts real React components (with their own scheduler, portals and synthetic events) inside Janux islands today, server-rendered and with props flowing from island state — see [Foreign-UI interop](/docs/guide/interop) and [`examples/interop-react`](https://github.com/aralroca/Janux/tree/main/examples/interop-react). What it does *not* give you for free is an agent surface for those components: a foreign island renders a view only, so wrap it in a shell whose state it renders and whose intents drive it. That wrap is demonstrated, not described — the [interop compatibility matrix](/docs/more/interop-matrix) has one worked example per category (data grid, virtualization, charts, drag & drop, graph editor, forms, command palette, a11y primitives), each building and passing browser tests in CI, and it states the caveats and the flat "no"s as plainly as the wins.

And it's a v0.x: the contract is stable by design, the implementation is young.

Related: [Architecture & roadmap](/docs/guide/architecture-and-roadmap) · [Foreign-UI interop](/docs/guide/interop) · [Examples](/docs/more/examples)
