# CLI

## Commands

```bash
janux dev   [--port 3000]    # Vite dev server: SSR, HMR, api stubs, agent endpoint
janux build                  # client bundle + styles + public/ → dist/client
janux start [--port 3000]    # production server on Bun (no Vite at runtime)
```

`PORT` env is honored when `--port` is absent.

## create-janux

```bash
bunx create-janux my-app
```

Scaffolds the conventional layout with a working Tasks app: a bifacial task board, a shared theme store, an api() module, a floating copilot and an example unit test.

## Project conventions

Everything is convention over configuration — each of these is optional:

| Path | Purpose |
|---|---|
| `src/routes/**` | File-system routing (`index.tsx` → `/`, `[id].tsx` → `:id`) |
| `src/server/*.api.ts` | api() modules → endpoints + client stubs + agent tools |
| `src/stores.ts` | Store defs available during SSR |
| `src/agent.ts` | `export default defineAgent({...})` |
| `src/client.ts` | `boot({ defs })` — omit for fully static apps (0 KB JS) |
| `src/styles.css` | App stylesheet, linked automatically |
| `public/` | Static assets served at `/` (favicon.svg auto-linked) |

## Environment

| Variable | Purpose |
|---|---|
| `JANUX_MODEL` | `provider/model` for the copilot |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Provider auth (also drives model sniffing) |
| `PORT` | Server port |

> **Note:** `janux start` runs your TSX directly on Bun — there is no server build step. `janux build` only bundles client assets.
