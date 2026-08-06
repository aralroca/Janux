---
title: Glossary
description: "The vocabulary this documentation uses: bifacial component, island, intent, guard, resumability, and the rest of the Agentic Web stack."
---

# Glossary

**Agent cursor** — the built-in simulated cursor that travels the screen element to element as an agent acts. A feedback layer enabled per app: `boot({ cursor: agentCursor() })` — imported code, so apps that skip it ship none of it.

**Agent glow** — the built-in highlight that rings the island (or the intent's declared `glowTarget`) while an agent operates it. Enabled with `boot({ glow: agentGlow() })`; combines freely with the agent cursor.

**Agentic Web** — the web as both people and AI agents operate it: pages that are simultaneously a human interface and a discoverable, callable, permissioned tool surface. Its stack is MCP (tools over HTTP), WebMCP (tools in the browser), `llms.txt` (discovery) and Web Bot Auth (identity). See [The Agentic Web](/docs/getting-started/the-agentic-web).

**Bifacial component** — the core primitive: one definition projecting a view (humans), a resource (agents) and tools (both). Named after Janus.

**Binding map** — the compiler's record of the provable static state reads in a view, each rewritten so that writing the field updates its one DOM site directly instead of re-rendering the island. On by default; `compiler: { bindingMaps: false }` is the escape hatch.

**Binding thunk** — the compiled form of one such read — `{state.count}` becomes `{() => (state.count)}` — subscribing to exactly the leaf paths it reads. What the analysis cannot prove keeps the re-render + morph path, with identical semantics.

**Island** — a bifacial component mounted in a page. Server-rendered, then *resumed* (not hydrated) on first interaction.

**Resource** — the agent-readable projection of a component's state: `ui://cart`, `store://theme`. Plain JSON, schema-described.

**Tool** — an intent or api() as agents see it: name, description, JSON Schema input, guard.

**Intent** — a named, schema-typed action on a component. The unit of interactivity *and* the tool unit. The only place state mutates.

**Guard** — `auto` / `confirm` / `forbidden`: who may invoke a tool and whether a human approves first. Resolved per request context.

**Proposal** — the suspended execution produced when an agent hits a `confirm` guard. A human approves (runs exactly once) or rejects.

**Manifest** — the machine-readable contract of a mounted page: resources, tools, guards, events. Generated from code; served at `/_janux/manifest`.

**Source** — declarative async data-in (`query` + refresh policy). Loads server-side before render; its value travels in the snapshot.

**Effect** — a named side effect with a declared trigger (`when`) and optional debounce/cleanup.

**Store** — a bifacial component without a view; shared state as `store://name`, mutable only through its own intents.

**Snapshot** — the serialized `{ state, sources }` a page embeds per island; what the client resumes from.

**Resume (structural resumability)** — booting an island from its snapshot without re-running or replaying anything. Zero component code until first interaction.

**Bridge** — `window.janux`: read / call / approve / settled / subscribe / manifest. The gui-agent surface of the page.

**settled()** — the quiescence primitive: resolves when no source, effect, debounce or in-flight intent remains. Kills `sleep(500)`.

**Origin** — who's invoking: `human` (clicks, forms — most privileged) or `agent` (bridge, copilot, `x-janux-origin`).

**ctx** — the per-request context built by `src/ctx.ts` (auth, tenant, role). Flows into apis, sources, guards and routes; agents act under the end user's ctx.

**Foreign island** — a component from another runtime (React today) mounted with `foreign()`: a real embedded root inside a Janux island. Projects a view only — no resource, no tools, until you wrap it.

**Harness** — the opt-in agent runtime around the loop: `defineAgent({ harness })` adds thread memory, guardrail processors, rate limits and identity resolution. Durable workflows, attachments and outbound MCP clients live alongside it.

**WebMCP** — the browser standard for exposing a page's tools to agents (`document.modelContext`). `boot()` registers every manifest tool with it, sanitizing names (`counter.inc` → `counter_inc`), and polyfills it where it's missing.

**Hosted MCP endpoint** — `/_janux/mcp`: a real, stateless MCP server generated from the app, so an external client (Claude Code, CI, any agent) drives the same tools by URL.

**Agent card** — `/.well-known/agent-card.json`: the [A2A](https://a2a-protocol.org/) discovery document, derived from the app's `api()` tools and skills (never written by hand) and served next to the A2A endpoint at `/_janux/a2a`.

**llms.txt** — an opt-in markdown index at `/llms.txt`: every page (dynamic routes enumerated by `staticParams`) and every server tool, with approval-gated ones annotated.

**Query cache** — `useQuery` / `mutation` / `QueryClient` from `janux/query`: server state with staleness, background revalidation and optimistic rollback. Component state stays in `schema`.

**urlState** — one query-string param bound to a schema-typed signal. The URL is the source of truth, so filters and tabs are deep-linkable and back/forward-correct — and query-only changes never re-render the page.

**Matcher** — a named predicate behind a typed route segment (`[id=int]`), built in or exported from `src/matchers.ts`.

**Zero-JS page** — a route mounting no islands: the HTML document contains no `<script>` at all.
