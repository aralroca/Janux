# Getting started

Janux is a fullstack UI framework with **two first-class audiences**: humans and AI agents. A single component definition projects a view (for people), a typed resource (for agents) and a set of tools (for both) — so your UI and your agent surface can never drift apart.

## Create an app

```bash
bunx create-janux my-app
cd my-app
bun install
bun run dev
```

The dev server prints three URLs:

- `http://localhost:3000/` — your app.
- `http://localhost:3000/_janux/manifest` — what agents see: resources, tools, guards.
- `http://localhost:3000/_janux/agent` — the built-in copilot endpoint.

## Project layout

```
my-app/
  src/
    routes/          # file-system routing: index.tsx → /, shop.tsx → /shop
    components/      # static + bifacial components
    server/          # *.api.ts server functions (auto agent tools)
    stores.ts        # shared stores (optional)
    agent.ts         # defineAgent({...}) (optional — zero config without it)
    client.ts        # boot({ defs: [...] }) client entry (optional for static apps)
  tsconfig.json      # jsx: react-jsx, jsxImportSource: janux
```

## Configure the copilot model

Zero config: set **one** environment variable and the agent resolves the rest.

```bash
# option 1: explicit model
JANUX_MODEL="anthropic/claude-fable-5" bun run dev

# option 2: just a provider key — the default model is inferred
ANTHROPIC_API_KEY=sk-... bun run dev   # or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY
```

Resolution order: `defineAgent({ model })` → `JANUX_MODEL` → provider-key sniffing → a setup card (the app still boots and tells you exactly which variable to set).

## Commands

| Command | What it does |
|---|---|
| `janux dev` | Dev server on Vite with SSR and HMR |
| `janux build` | Bundles client assets (skips cleanly if the app is fully static) |
| `janux start` | Production server on Bun |

Next: read [Components](/docs/guide/components) — the core idea of the framework.
