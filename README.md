<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg" />
    <img src="docs/logo.svg" width="150" alt="Janux — an engraved two-faced head: a human profile looking left, an agent profile looking right" />
  </picture>
</p>

<h1 align="center">Janux</h1>

<p align="center">
  <strong>The fullstack framework for the Agentic Web.</strong><br/>
  One component, two faces: a live view for humans, typed MCP tools &amp; resources for AI agents — generated from the same definition, so they can never drift.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/janux"><img src="https://img.shields.io/npm/v/janux" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/janux"><img src="https://img.shields.io/npm/dm/janux" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/tests-4096%20passing-brightgreen" alt="4096 tests passing" />
  <img src="https://img.shields.io/badge/runtime-Bun-14151a?logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/compiler-Vite%20%2B%20SWC-646cff?logo=vite&logoColor=white" alt="Vite + SWC" />
  <img src="https://img.shields.io/badge/TypeScript-first-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://janux.build"><strong>Website</strong></a> ·
  <a href="https://janux.build/docs/getting-started/what-is-janux">Docs</a> ·
  <a href="https://janux.build/docs/getting-started/quick-start">Quick start</a> ·
  <a href="https://janux.build/docs/getting-started/the-agentic-web">The Agentic Web</a> ·
  <a href="https://janux.build/playground">Playground</a> ·
  <a href="https://github.com/aralroca/Janux/issues/1">RFC 0001</a>
</p>

<p align="center">
  <img src="docs/demo.gif" width="1000" alt="Demo: a console driven in natural language — the agent invites a teammate, searches users, renames a field through the DOM fallback and builds a React Flow workflow, while status chips report each tool call and an animated gradient ring tours every element it touches, including nodes that mount asynchronously" />
</p>

<p align="center"><sub><a href="examples/with-web-agent">examples/with-web-agent</a> — the agent calls the same intents a human clicks, and <code>createCopilot({ visualize })</code> is the whole of the feedback: a chip per tool call, a gradient ring on the element being operated, and a backdrop veil that keeps the user's focus on the action.</sub></p>

---

## Why Janux

The web is growing a second audience. People still click, but agents now read, plan and act on the same pages — through MCP clients, through browser agents, through copilots embedded in your own product. **The Agentic Web is the web both of them can operate**, and it is being standardized in the open: MCP for tools over HTTP, WebMCP for tools in the browser, `llms.txt` for discovery, Web Bot Auth for identity.

Today, making an app agent-operable means building it twice. The UI already holds the logic — the validation, the permissions, the business rules — and then a second, hand-written integration re-declares a fraction of it as tools. Two artifacts, one source of truth, and the gap between them grows with every sprint. Tools drift, guardrails are ad-hoc, and nobody can say exactly what an agent is allowed to do.

Janux removes the second artifact. **A component is simultaneously a view, an agent-readable resource and a set of typed tools** — one definition, projected three ways by the framework. A human click and an agent tool call enter the *same* pipeline: guard check → schema validation → `run()` → audit entry. The contract can't rot, because it is generated from the code that renders.

Named after **Janus**, the two-faced Roman god of doorways: one face toward the human, one toward the agent, one threshold. Designed in [RFC 0001](https://github.com/aralroca/Janux/issues/1).

## Table of Contents

- [Install](#install)
- [Quick start](#quick-start)
- [One component, three projections](#one-component-three-projections)
- [Two agent surfaces, zero integration](#two-agent-surfaces-zero-integration)
- [Humans stay in the loop](#humans-stay-in-the-loop)
- [Highlights](#highlights)
- [How it works](#how-it-works)
- [Performance](#performance)
- [Packages](#packages)
- [Documentation](#documentation)
- [Benchmarks](#benchmarks)
- [Examples](#examples)
- [Develop](#develop)
- [Contributing](#contributing)
- [Releases](#releases)
- [License](#license)

## Install

```bash
bunx create-janux my-app
cd my-app && bun install && bun run dev
```

Requires [Bun](https://bun.sh) ≥ 1.3 — the dev server, the build and the production server all run on it.

Or add the pieces to an existing workspace:

```bash
bun add janux @janux/server @janux/agent @janux/cli
```

## Quick start

```tsx
import { component, intent, schema, str, int, money, list } from 'janux';
import { pay } from './pay.api';

//  UI component + 2 WebMCP tools (intents), grouped together for maintainability
export const Cart = component({
  name: 'cart',
  description: 'Shopping cart with line items.',
  state: schema({ items: list({ productId: str(), qty: int().min(1), unitPrice: money() }) }),
  derived: { total: (s) => s.items.reduce((a, i) => a + i.qty * i.unitPrice, 0) },
  intents: {
    addItem: intent({
      description: 'Add a product to the cart',
      input: schema({ productId: str(), qty: int().default(1), unitPrice: money().default(0) }),
      run: ({ state, input }) => state.items.push(input),
    }),
    checkout: intent({ description: 'Pay for the cart', guard: 'confirm', run: ({ state }) => pay({ items: state.items }) }),
  },
  view: ({ state, derived, intents }) => (
    <section>
      <ul>
        {state.items.map((i) => (
          <li key={i.productId}>{i.productId} × {i.qty}</li>
        ))}
      </ul>
      <button onClick={intents.checkout}>Pay ({derived.total}¢)</button>
    </section>
  ),
});
```

You wrote a shopping cart. You also shipped an agent surface — generated, no second file:

```json
{
  "resources": ["ui://cart"],
  "tools": [
    { "name": "cart.addItem", "description": "Add a product to the cart", "guard": "auto" },
    { "name": "cart.checkout", "description": "Pay for the cart", "guard": "confirm" }
  ]
}
```

## One component, three projections

| Projection | For | What it is |
|---|---|---|
| **View** | humans | server-rendered HTML that resumes on first interaction |
| **Resource** | agents | `ui://cart` — typed JSON state, readable and subscribable |
| **Tools** | both | `cart.addItem` (auto), `cart.checkout` (**confirm** → a human approves) |

They cannot drift: there is one definition, and the framework derives the other two. A human click and an agent tool call run the **exact same pipeline** — guard check → schema validation → `run()` → audit entry.

## Two agent surfaces, zero integration

Every Janux app speaks the Agentic Web's protocols out of the box. You declare no tools twice, and you write no adapters.

| Standard | What Janux does with it |
|---|---|
| **MCP** — tools over HTTP | A real, stateless MCP server at `/_janux/mcp`, generated from your `api()` functions. Dual-era: negotiates `2026-07-28` and `2025-06-18`. |
| **WebMCP** — tools in the browser | Every mounted intent is registered with `document.modelContext` the moment its island mounts, so browser agents and the DevTools panel see it. Polyfilled where the API is missing. |
| **`llms.txt`** — discovery | Opt-in site index at `/llms.txt` (dynamic routes expanded via `staticParams`), plus a Markdown projection of every page by appending `.md`. |
| **Web Bot Auth** (RFC 9421) | Signed agent identity, verified per request under an `observe` or `require` policy. |
| **Human approval** | `guard: 'confirm'` reaches MCP clients as `annotations.requiresApproval`, and parks agent calls as Proposals. |

Pointing Claude, Cursor or any MCP client at your app is a URL, not an integration project:

```bash
claude mcp add --transport http my-app https://your.app/_janux/mcp
```

## Humans stay in the loop

Guards are a language feature, not a convention. Every `intent` and every `api()` declares who may call it:

- **`auto`** — agents call it directly.
- **`confirm`** — a human click runs it; an *agent* call parks as a **Proposal** that a person approves or rejects on the real UI, executing exactly once.
- **`forbidden`** — never exposed as a tool. The agent falls back to the DOM, under the same permissions as a user.

Every invocation records its **origin** (`human` / `agent`) in an audit trail, and `janux verify` fails the build if an agent-reachable tool ships without a description. See [`examples/human-in-the-loop`](examples/human-in-the-loop).

## Highlights

- 🧿 **One definition, three projections.** The mounted tree *is* the MCP tree — UI and agent surface cannot drift.
- 🪶 **0 KB JS static pages.** Components without state compile to plain HTML; a page with no islands ships no `<script>` at all.
- ⚡ **Structural resumability.** State is schema-typed JSON, behavior is named — the client resumes from snapshots with no hydration replay and no closure serialization. Zero component code runs until first interaction (asserted in the test suite).
- 🔌 **`api()` = endpoint + stub + tool.** A server function is at once a validated HTTP endpoint, a ~100-byte typed client stub (SWC transform) and an agent tool.
- 🤖 **Zero-config copilot.** `JANUX_MODEL` or one provider API key (Anthropic, OpenAI, Google or OpenRouter) is all it takes. Every app ships the agent endpoint, the manifest and the gui-agent bridge (`window.janux`).
- 🗺️ **App-wide agent control.** Every turn advertises built-in client tools (`ui_navigate`, `ui_get_view_context`, `ui_read_page`, `ui_click`, `ui_fill`, `ui_wait_settled`) plus the full route map — and `ui_calls` turns resume with their results (act → observe → continue), so navigate-then-act works in one turn.
- ⚛️ **Foreign-UI interop.** `foreign()` mounts React components unchanged — real embedded roots, tracked props, callbacks→intents — surviving SPA navigation.
- 🧘 **Observable quiescence.** `await janux.settled()` — the `sleep(500)` idiom dies here.
- 🧪 **CI for the agent surface.** `janux verify` gates undescribed tools; `janux eval` replays scripted agent tasks — including real human-approval steps — against a live app.

## How it works

```
Browser ── janux core (signals, resume, morph, delegation, window.janux bridge)
   │  HTML + state snapshots │ RPC │ agent turns
Server ── @janux/server (SSR, api(), manifest, proposals)
              └── @janux/agent (model resolution, provider loop: api.* server-side, ui_calls → bridge)
```

- **SSR**: sources load server-side; islands arrive with real content plus a JSON state snapshot.
- **Resume**: `boot()` indexes islands, installs two delegated listeners, and mounts an island **only** on first interaction or agent call — from the snapshot, morphing the SSR DOM in place.
- **Agents**: `GET /_janux/manifest?path=/shop` for discovery; `POST /_janux/api/*` for server tools; `window.janux.call()` for UI tools; `POST /_janux/approve` for proposals.
- **Static export**: `output: "static"` prerenders every page into `dist/client` — deploy docs and marketing sites to any static host, agent face included, no server.

### Configure the copilot model

Zero config — first match wins:

1. `defineAgent({ model: 'anthropic/claude-fable-5' })`
2. `JANUX_MODEL=provider/model`
3. Provider key sniffing: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`
4. Nothing set → the endpoint answers with a setup card; the app never crashes.

## Performance

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/lighthouse-100-dark.gif" />
    <img src="docs/lighthouse-100-light.gif" width="640" alt="Lighthouse report for the Janux documentation: 100 in performance, accessibility, best practices and SEO, and 4/4 on the new agentic browsing check" />
  </picture>
</p>

The documentation site is built with Janux ([apps/docs](apps/docs)) and scores 100 across the board — including **Agentic Browsing**, Lighthouse's check for whether an agent can actually read and operate the page. A CI job re-runs the audit on every pull request.

## Packages

| Package | What |
|---|---|
| [`janux`](packages/janux) | Core: schema, signals, reactive state, component runtime, SSR islands, manifest, client resume + bridge, foreign interop, data cache, built-in client tools, glow |
| [`@janux/server`](packages/janux-server) | api() RPC, file-system router (layouts, groups, matchers, middleware), HTTP handlers + uploads, HTML shell, `/_janux/*` endpoints incl. the hosted MCP + `.md` projections, llms.txt, Web Bot Auth |
| [`@janux/agent`](packages/janux-agent) | Model resolution, providers, the tool loop with turn continuation, and the embedded harness: memory (in-memory/Postgres), durable workflows, guardrail processors, rate limiting (in-memory/Redis), attachments, outbound MCP client |
| [`@janux/vite`](packages/janux-vite) | Vite plugin (SWC api stubs, SSR bridge) |
| [`@janux/cli`](packages/janux-cli) | `janux dev / build / start / verify / eval` |
| [`create-janux`](packages/create-janux) | Scaffolder |

## Documentation

**[janux.build](https://janux.build)** — 88 pages, ⌘K search, dark mode, and a copilot that answers from the docs themselves.

| Section | Start here |
|---|---|
| **Getting started** | [What is Janux?](apps/docs/content/getting-started/what-is-janux.md) · [Quick start](apps/docs/content/getting-started/quick-start.md) · [The Agentic Web](apps/docs/content/getting-started/the-agentic-web.md) · [Mental model](apps/docs/content/getting-started/mental-model.md) |
| **Guide** | [Components](apps/docs/content/guide/components.md) · [Views and JSX](apps/docs/content/guide/views-and-jsx.md) · [Intents and guards](apps/docs/content/guide/intents-and-guards.md) · [Navigation](apps/docs/content/guide/navigation.md) · [The agent and your copilot](apps/docs/content/guide/agent-and-copilot.md) |
| **Tutorial** | [A task board with two faces](apps/docs/content/tutorial/tasks-app-part-1.md) (3 parts) |
| **Reference** | one page per export: [reactivity](apps/docs/content/reference/signal.md), [client](apps/docs/content/reference/client-state.md), [data cache](apps/docs/content/reference/data-cache-api.md), [agent harness](apps/docs/content/reference/agent-memory.md), [CLI](apps/docs/content/reference/cli.md) |
| **Recipes** | [Testing components](apps/docs/content/recipes/testing-components.md) · [Forms](apps/docs/content/recipes/forms.md) · [Optimistic UI](apps/docs/content/recipes/optimistic-ui.md) · [Error handling](apps/docs/content/recipes/error-handling.md) · [Custom server](apps/docs/content/recipes/custom-server.md) · [Docker](apps/docs/content/recipes/docker.md) · [Monorepo](apps/docs/content/recipes/monorepo-setup.md) · [Tailwind](apps/docs/content/styles/tailwind.md) · [Local model copilot](apps/docs/content/recipes/local-model-copilot.md) |
| **More** | [Examples](apps/docs/content/more/examples.md) · [Comparison](apps/docs/content/more/comparison.md) · [Benchmarks](apps/docs/content/more/benchmarks.md) · [FAQ](apps/docs/content/more/faq.md) · [Glossary](apps/docs/content/more/glossary.md) |

Agents read the same docs at `/llms.txt` and any page as Markdown by appending `.md`.

**Every example is verified.** `packages/docs-tests` compiles every snippet, checks it imports only symbols the packages really export, runs the main example of a page and asserts what the prose claims. Three guards fail the build when an export has no reference page, when a page's executable claims aren't executed, or when any documented link stops resolving. **Both backlogs are empty**: every public export is documented, and every page that imports the framework has a test that runs it.

## Benchmarks

19 multi-framework suites — client runtime, hydration, SSR, streaming and
shipped bytes — measuring Janux against react 19, preact, solid 2, svelte 5
and vue-vapor, with correctness gates before any number counts. The harness
is a port of [octane](https://github.com/octanejs/octane)'s benchmarks (MIT,
Dominic Gannaway; `js-framework` fixtures derive from
[krausest](https://github.com/krausest/js-framework-benchmark), Apache-2.0).

| Category | Where Janux stands |
|---|---|
| Resume vs hydration | **0.13–0.24× react** — 0.33ms to make the news page interactive (react 2.58) |
| Shipped JS | 24.2KB gzip total vs react 60.7 (preact 9.8 · solid 13.7 · svelte 17.9); islands-free pages ship 0KB |
| Mass DOM work | 10k rows: 84.9ms vs react 131.8; clear 36.0 vs 48.4; 512-field reset 15.4 vs 39.0 |
| Whole-app suites | parity: lifecycle 1.00×, store integrations 0.83–1.14× (TanStack invalidation outlier 1.62×), suspense recovery 1.0–1.1× |
| Keyed micro-ops | behind: select-1-of-1000 7.7ms vs react 0.46 — needs the fine-grained list primitive (RFC) |
| SSR throughput | behind: 4.5× react on buffered renders; streaming end-to-end at parity |

Full tables, methodology and machine specs:
[docs page](apps/docs/content/more/benchmarks.md) · reproduce with
`bun run bench` from [`benchmarks/`](benchmarks/).

## Examples

34 runnable apps, each a real Janux project — `bun run --cwd examples/<name> dev`.

### Start here

| Example | What it shows |
|---|---|
| [`shop`](examples/shop) | The full picture: catalog source, debounced persist effect, `confirm` checkout with human approval, copilot included. |
| [`hacker-news`](examples/hacker-news) | The canonical clone: streaming suspense front page, `[page=integer]` pagination, a server-rendered nested comment tree, `useQuery` refresh and hover prefetch. |

### The agentic surface

| Example | What it shows |
|---|---|
| [`with-web-agent`](examples/with-web-agent) | The demo above: a console operated in natural language, `createCopilot({ visualize })` for the chips/ring/veil, `glowTarget` for React Flow nodes that mount late, and a `forbidden` intent that forces the DOM fallback. |
| [`human-in-the-loop`](examples/human-in-the-loop) | Who invokes changes what happens: the same `confirm` intent executes on a human click but parks as a Proposal for an agent, with an approvals inbox and an origin-labeled audit trail. |
| [`with-mcp-url`](examples/with-mcp-url) | The app as a bearer-protected MCP server by URL, with a committed tool contract (`agent-contract.json`) that turns CI red if the agent surface drifts. |
| [`with-mcp-client`](examples/with-mcp-client) | The outbound direction: the app's agent connects to an external MCP server by URL, filters the remote tools and re-exposes them on its own surface. |
| [`durable-agent`](examples/durable-agent) | The harness in production shape: Postgres conversation memory that survives restarts, Redis rate limiting, injection guardrails, and a durable two-step workflow. |
| [`with-local-llm`](examples/with-local-llm) | The copilot's model runs in the browser over WebGPU (`localLlm()`), with `supportsLocalLlm()` detection, a `serverLlm()` fallback and a live local↔cloud swap. |
| [`agent-evals`](examples/agent-evals) | `janux eval` as a CI gate: scripted, model-free agent tasks replayed over the real webMCP surface, including a human approval step — plus a broken eval that proves the gate can fail. |

### Components & state

| Example | What it shows |
|---|---|
| [`nested-islands`](examples/nested-islands) | Stateful islands inside stateful islands, with dispose semantics. |
| [`cross-island-state`](examples/cross-island-state) | A `store()` cart shared by five islands with no prop drilling, `persist: 'local'` across reloads, a bus event that crosses islands, and `batch()`ed bundle adds. |
| [`with-forms`](examples/with-forms) | One `schema()` as the contract for three surfaces: the form UI (per-field errors, no reload), the `api()` endpoint, and the typed agent tool. |
| [`with-optimistic-ui`](examples/with-optimistic-ui) | `mutation()` with optimistic writes and real rollback: the server rejects every third save and `onError` restores the snapshot with a visible notice. |
| [`data-cache`](examples/data-cache) | `useQuery` with a reactive query key, typed URL state (`urlState`) that deep-links and honors Back, and agent parity for the same filter. |

### React interop

One example per **category**, each verified in CI — the [compatibility matrix](apps/docs/content/more/interop-matrix.md) states what works, what works with caveats, and what does not.

| Example | What it shows |
|---|---|
| [`interop-react`](examples/interop-react) | A React component (unchanged) mounted with `foreign()`: tracked props, callbacks→intents. |
| [`interop-data-grid`](examples/interop-data-grid) | `@tanstack/react-table` fully controlled from island state, with its **updater-function** callbacks mapped onto intents — the case `on: { prop: 'intent' }` cannot express. |
| [`interop-virtual-list`](examples/interop-virtual-list) | `@tanstack/react-virtual` over 10,000 rows, server-rendered as a real first window, and `scrollToRow` reaching a row no DOM-scraping agent could click. |
| [`interop-charts`](examples/interop-charts) | `recharts`, whose `onClick(data, **index**, event)` payload is the second argument — and an e2e that asserts what Recharts does *not* server-render. |
| [`interop-drag-drop`](examples/interop-drag-drop) | `@dnd-kit` with its a11y wiring server-rendered, and an **unserializable** drag event mapped onto `move { id, toIndex }` — the tool an agent calls to reorder without dragging. |
| [`interop-graph-editor`](examples/interop-graph-editor) | `@xyflow/react` driven both ways: a node drag and a drawn edge become `moveNode` / `connect`. `hydrate: 'only'`, because React Flow measures its viewport on mount. |
| [`interop-forms`](examples/interop-forms) | The honest caveat: `react-hook-form` + `zod` own the inputs, so an agent's `fill` has to be reconciled into them explicitly. |
| [`interop-command-palette`](examples/interop-command-palette) | `cmdk`, with an e2e assertion that the rendered command ids and `palette.run`'s enum are the same list. |
| [`interop-a11y-primitives`](examples/interop-a11y-primitives) | `@radix-ui/react-dialog` with its focus trap and scroll lock intact, portalling out of the foreign host — and a navigation with the dialog open that neither throws nor leaves `<body>` unscrollable. |

### Rendering & routing

| Example | What it shows |
|---|---|
| [`with-suspense`](examples/with-suspense) | Streaming SSR: independent `suspense` boundaries that reveal mid-stream, and `error` boundaries that bubble. |
| [`with-advanced-routing`](examples/with-advanced-routing) | The full router grammar: `[slug]`, `[...path]`, `[[...rest]]`, `[id=integer]`/`[uid=uuid]` matchers, nested `_layout.tsx` chains, `(marketing)` groups and the `_404.tsx`/`_500.tsx` pages, plus SPA navigation with a `persist` island. |
| [`blog-static`](examples/blog-static) | A markdown blog exported with `output: 'static'` + `staticParams`: zero-JS pages, speculation rules, and the agent face (`llms.txt`, sitemap, `.md` projections) from the same build. |
| [`with-content`](examples/with-content) | Typed content collections: frontmatter validated by the same `schema()` as component state, and MDX notes that embed a real Janux island and a React component via `foreign()` — compiled on the server, so a note of prose still ships 0 KB. |
| [`i18n`](examples/i18n) | Internationalization: locale-prefixed routing, language switcher, type-safe `t()` with plurals, and page-scoped client translations. |

### Styling

| Example | What it shows |
|---|---|
| [`with-tailwind`](examples/with-tailwind) | `@janux/tailwind` zero-config: a pricing page with dark mode and a stateful billing toggle, styled only with v4 utilities. |
| [`with-sass`](examples/with-sass) | Sass with no config beyond the file extension: tokens, nesting, a mixin and four accent classes generated by one `@each` loop, compiled to a single `/styles.css`. |
| [`with-css-variables`](examples/with-css-variables) | Runtime theming: island state writes `--brand`/`--pad`/`--radius` onto one wrapper and the cascade rethemes the page, with no rebuild and no extra stylesheet. |

### Server & data

| Example | What it shows |
|---|---|
| [`with-sqlite`](examples/with-sqlite) | Real persistence with `bun:sqlite` and both server surfaces on one database: `api()` RPC (delete is `confirm`-guarded — agents propose, humans approve) next to classic REST handlers. |
| [`with-uploads`](examples/with-uploads) | End-to-end file uploads: `dropzone()` feeding a validating multipart handler (type + size), server-rendered gallery, previews without a reload. |
| [`realtime-chat`](examples/realtime-chat) | A custom server composing `createJanuxServer` with Bun's native WebSockets: optimistic delivery, cursor-based replay on reconnect, live presence. |
| [`with-worker`](examples/with-worker) | `worker()`: the same prime-counting function on a Web Worker and on the main thread, with a ticker that proves which one froze the page. |

## Develop

```bash
bun install
bun test             # the whole suite: schema, signals, runtime, SSR, resume, morph, interop, router, cache, guards, agent loop, harness, SWC stubs
bun run test:census  # per-area counts, the coverage floor, and the count the docs claim
bun run typecheck
```

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Third-party work Janux builds on is credited in [CREDITS.md](CREDITS.md); security reports go through [SECURITY.md](SECURITY.md).

## Releases

Janux is 0.x, and every published package moves on one version.

- [CHANGELOG.md](CHANGELOG.md) — what changed, newest first.
- [VERSIONING.md](VERSIONING.md) — what a minor is allowed to break, how much notice you get, and how long each one is supported.
- [STABILITY.md](STABILITY.md) — every public export marked stable, experimental or internal. Generated from the exports themselves.

## License

[MIT](LICENSE) © [Aral Roca](https://aralroca.com)
