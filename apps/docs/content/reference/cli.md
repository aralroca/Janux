# CLI

## Commands

```bash
janux dev   [--port 3000]    # Vite dev server: SSR, HMR, api stubs, agent endpoint
janux build                  # client bundle + styles + public/ → dist/client (+ prerendered HTML with output: "static")
janux start [--port 3000]    # production server on Bun (no Vite at runtime)
janux verify                 # agent-surface contract checks (CI-friendly)
janux eval [files...]        # scripted agent-task scenarios against a live app
```

`PORT` env is honored when `--port` is absent.

## janux verify

Renders every route's manifest and fails (exit 1) when an agent-reachable tool
— an `intent()` or `api()` whose guard is not `forbidden` — has no
`description`. Descriptions are the contract agents plan against; an
undescribed tool degrades every conversation silently, so it fails the build
instead. Routes that throw during render are reported as warnings (their
surface cannot be verified).

## janux eval

"Can an agent actually complete this task through my tools?" as a repeatable
CI check. Runs `evals/**/*.eval.json` (or explicit files) against a live app
and exits 1 on any failed expectation.

```bash
janux eval --start "janux start"        # boots the app, runs, stops it
janux eval --url http://localhost:3000  # against a server you manage
janux eval evals/checkout.eval.json --json
```

```jsonc
{
  "name": "shop agent checkout",
  "steps": [
    { "tool": "api.shop.catalog", "expect": { "result": { "products": [{ "id": "p1" }] } } },
    { "tool": "api.shop.pay", "input": { "total": 5999 },
      "expect": { "result": { "status": "proposal" } } },
    { "approve": "$steps[1].result.id", "expect": { "result": { "charged": 5999 } } }
  ]
}
```

Steps run in order with `x-janux-origin: agent`. `$steps[i].<path>` references
resolve against earlier outcomes (`{ status, ok, result, error }`) anywhere in
`input` or `approve`. An `approve` step exercises the real human-in-the-loop
flow (`POST /_janux/approve`) — the same pipeline your UI uses. `expect`
checks any of `ok` (default `true` when omitted), `status`, `error`
(substring) and `result` (deep subset match).

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
| `package.json` → `"janux"` | Optional app config (`title`, `llmsTxt`, `output`, …) — same shape as the Vite plugin options, which win over it |

```jsonc
// package.json
{
  "janux": {
    "llmsTxt": { "title": "My App", "description": "What agents should know." },
    "output": "static"
  }
}
```

## output

| Value | Meaning |
|---|---|
| `"bun"` (default) | `janux start` serves the app on a Bun server |
| `"static"` | `janux build` also prerenders every page into `dist/client` (`/docs/x` → `docs/x/index.html`, plus `llms.txt`) — deploy to any static host, no server. Dynamic routes need `staticParams` ([Route modules](/docs/reference/server-api)); those without it are skipped with a warning |

More output targets will come later. Full walkthrough: [Deploying → Static export](/docs/recipes/deploying).

## Environment

| Variable | Purpose |
|---|---|
| `JANUX_MODEL` | `provider/model` for the copilot |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Provider auth (also drives model sniffing) |
| `PORT` | Server port |

> **Note:** `janux start` runs your TSX directly on Bun — there is no server build step. `janux build` only bundles client assets.
