<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg" />
    <img src="docs/logo.svg" width="150" alt="Janux — an engraved two-faced head: a human profile looking left, an agent profile looking right" />
  </picture>
</p>

<h1 align="center">Janux</h1>

<p align="center">
  <strong>The agent-native fullstack UI framework.</strong><br/>
  One component, two faces: a live view for humans, typed MCP tools &amp; resources for AI agents — generated from the same definition.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/janux"><img src="https://img.shields.io/npm/v/janux" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/janux"><img src="https://img.shields.io/npm/dm/janux" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/tests-2053%20passing-brightgreen" alt="2053 tests passing" />
  <img src="https://img.shields.io/badge/runtime-Bun-14151a?logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/compiler-Vite%20%2B%20SWC-646cff?logo=vite&logoColor=white" alt="Vite + SWC" />
  <img src="https://img.shields.io/badge/TypeScript-first-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

---

Named after **Janus**, the two-faced Roman god of doorways: one face toward the human, one toward the agent, one threshold. Designed in [RFC 0001](https://github.com/aralroca/Janux/issues/1).

- 🧿 **One definition, three projections.** A component is simultaneously a view (DOM), a resource (`ui://cart`) and a set of tools (`cart.addItem`). The mounted tree *is* the MCP tree — UI and agent surface cannot drift.
- 🪶 **0 KB JS static pages.** Components without state compile to plain HTML; a page with no islands ships no `<script>` at all.
- ⚡ **Structural resumability.** State is schema-typed JSON, behavior is named — the client resumes from snapshots with no hydration replay and no closure serialization. Zero component code runs until first interaction (asserted in the test suite).
- 🛡️ **Guards as a language feature.** `auto` / `confirm` / `forbidden` on every intent and api. Agent proposals are approved by humans on the real UI, with an audit trail.
- 🔌 **`api()` = endpoint + stub + tool.** A server function is at once a validated HTTP endpoint, a ~100-byte typed client stub (SWC transform) and an agent tool.
- 🤖 **Zero-config copilot.** `JANUX_MODEL` or one provider API key (Anthropic, OpenAI, Google or OpenRouter) is all it takes. Every app ships the agent endpoint, the manifest and the gui-agent bridge (`window.janux`).
- 🗺️ **App-wide agent control.** Every turn advertises built-in client tools (`ui_navigate`, `ui_get_view_context`, `ui_read_page`, `ui_click`, `ui_fill`, `ui_wait_settled`) plus the full route map — and `ui_calls` turns resume with their results (act → observe → continue), so navigate-then-act works in one turn.
- ⚛️ **Foreign-UI interop.** `foreign()` mounts React components unchanged — real embedded roots, tracked props, callbacks→intents — surviving SPA navigation.
- 🧘 **Observable quiescence.** `await janux.settled()` — the `sleep(500)` idiom dies here.


## Table of Contents

- [Install](#install)
- [Quick start](#quick-start)
- [One component, two faces](#one-component-two-faces)
- [How it works](#how-it-works)
- [Configure the copilot model](#configure-the-copilot-model)
- [Packages](#packages)
- [Documentation](#documentation)
- [Examples](#examples)
- [Develop](#develop)
- [Contributing](#contributing)
- [License](#license)

## Install

```bash
bunx create-janux my-app
cd my-app && bun install && bun run dev
```

Or add the pieces to an existing workspace:

```bash
bun add janux @janux/server @janux/agent @janux/cli
```

## Quick start

```tsx
import { component, intent, schema, str, int, money, list } from 'janux';
import { pay } from './pay.api';

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
      <button on={intents.checkout}>Pay ({derived.total}¢)</button>
    </section>
  ),
});
```

## One component, two faces

That single definition is, at once:

| Projection | For | What it looks like |
|---|---|---|
| **View** | humans | server-rendered HTML, resumable island |
| **Resource** | agents | `ui://cart` — typed state, readable & subscribable |
| **Tools** | both | `cart.addItem` (auto), `cart.checkout` (**confirm** → human approves) |

A human click and an agent tool call run the **exact same pipeline**: guard check → schema validation → `run()` → audit entry.

## How it works

```
Browser ── janux core (signals, resume, morph, delegation, window.janux bridge)
   │  HTML + state snapshots │ RPC │ agent turns
Server ── @janux/server (SSR, api(), manifest, proposals)
              └── @janux/agent (model resolution, provider loop: api.* server-side, ui_calls → bridge)
```

- **SSR**: sources load server-side; islands arrive with real content plus a JSON state snapshot.
- **Resume**: `boot()` indexes islands, installs two delegated listeners, and mounts an island **only** on first interaction or agent call — from the snapshot, morphing the SSR DOM in place.
- **Agents**: `GET /_janux/manifest?path=/shop` for discovery; `POST /_janux/api/*` for server tools; `window.janux.call()` for UI tools; `POST /_janux/approve` for proposals. Opt-in `GET /llms.txt` site index (dynamic routes expanded via `staticParams`) and Web Bot Auth (RFC 9421) agent identity.
- **CI for the agent surface**: `janux verify` fails the build on undescribed agent-reachable tools; `janux eval` replays scripted agent tasks (with real human-in-the-loop approve steps) against a live app.
- **Static export**: `output: "static"` prerenders every page into `dist/client` — deploy docs/marketing sites to any static host, no server.

## Configure the copilot model

Zero config — first match wins:

1. `defineAgent({ model: 'anthropic/claude-fable-5' })`
2. `JANUX_MODEL=provider/model`
3. Provider key sniffing: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`
4. Nothing set → the endpoint answers with a setup card; the app never crashes.

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

**[janux.dev docs](https://github.com/aralroca/Janux/tree/main/apps/docs)** — 74 pages, ⌘K search, dark mode, and a copilot that answers from the docs themselves.

| Section | Start here |
|---|---|
| **Getting started** | [What is Janux?](apps/docs/content/getting-started/what-is-janux.md) · [Quick start](apps/docs/content/getting-started/quick-start.md) · [Mental model](apps/docs/content/getting-started/mental-model.md) |
| **Guide** | [Components](apps/docs/content/guide/components.md) · [Views and JSX](apps/docs/content/guide/views-and-jsx.md) · [Intents and guards](apps/docs/content/guide/intents-and-guards.md) · [Navigation](apps/docs/content/guide/navigation.md) · [The agent and your copilot](apps/docs/content/guide/agent-and-copilot.md) |
| **Tutorial** | [A task board with two faces](apps/docs/content/tutorial/tasks-app-part-1.md) (3 parts) |
| **Reference** | one page per export: [reactivity](apps/docs/content/reference/signal.md), [client](apps/docs/content/reference/client-state.md), [data cache](apps/docs/content/reference/data-cache-api.md), [agent harness](apps/docs/content/reference/agent-memory.md), [CLI](apps/docs/content/reference/cli.md) |
| **Recipes** | [Testing components](apps/docs/content/recipes/testing-components.md) · [Forms](apps/docs/content/recipes/forms.md) · [Optimistic UI](apps/docs/content/recipes/optimistic-ui.md) · [Error handling](apps/docs/content/recipes/error-handling.md) · [Custom server](apps/docs/content/recipes/custom-server.md) · [Docker](apps/docs/content/recipes/docker.md) · [Monorepo](apps/docs/content/recipes/monorepo-setup.md) · [Tailwind](apps/docs/content/recipes/tailwind.md) · [Local model copilot](apps/docs/content/recipes/local-model-copilot.md) |
| **More** | [Examples](apps/docs/content/more/examples.md) · [Comparison](apps/docs/content/more/comparison.md) · [FAQ](apps/docs/content/more/faq.md) · [Glossary](apps/docs/content/more/glossary.md) |

Agents read the same docs at `/llms.txt` and any page as Markdown by appending `.md`.

**Every example is verified.** `packages/docs-tests` compiles every snippet, checks it imports only symbols the packages really export, runs the main example of a page and asserts what the prose claims. Three guards fail the build when an export has no reference page, when a page's executable claims aren't executed, or when any documented link stops resolving. **Both backlogs are empty**: every public export is documented, and every page that imports the framework has a test that runs it.

## Examples

- [`examples/shop`](examples/shop) — full cart + copilot: catalog source, debounced persist effect, `confirm` checkout with human approval.
- [`examples/i18n`](examples/i18n) — internationalization: locale-prefixed routing, language switcher, type-safe `t()` with plurals, and page-scoped client translations.
- [`examples/interop-react`](examples/interop-react) — a React component (unchanged) mounted with `foreign()`: tracked props, callbacks→intents.
- [`examples/nested-islands`](examples/nested-islands) — stateful islands inside stateful islands, with dispose semantics.
- [`examples/data-cache`](examples/data-cache) — `useQuery`/`mutation` + persisted stores + typed URL state.

```bash
bun run --cwd examples/shop dev
bun run --cwd examples/i18n dev
```

## Develop

```bash
bun install
bun test             # 2053 tests: schema, signals, runtime, SSR, resume, morph, interop, router, cache, guards, agent loop, harness, SWC stubs
bun run test:census  # per-area counts and the coverage floor
bun run typecheck
```

[`packages/conformance`](packages/conformance) holds a behavioural corpus: the
cases other frameworks learnt the hard way, translated to Janux's API. No test
code was copied — each row carries the suite it came from (see
[CREDITS.md](CREDITS.md)), a guard fails the build on a duplicate id or a repeated
input/expected pair, and cases for features Janux does not have are recorded in
[GAPS.md](GAPS.md) rather than padded in as empty `test.todo`s.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © [Aral Roca](https://aralroca.com)
