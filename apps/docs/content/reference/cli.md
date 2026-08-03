---
title: CLI
description: "Every command, flag and exit code the Janux CLI ships with: dev, build, start, verify and eval, plus the environment variables they read."
---

# CLI

## Commands

```bash
janux dev   [--port 3000]    # Vite dev server: SSR, HMR, api stubs, agent endpoint
janux build                  # client bundle + styles + public/ → dist/client (+ prerendered HTML with output: "static")
janux start [--port 3000]    # production server on Bun (no Vite at runtime)
janux test  [files...]       # the app's suite via bun test (flags pass through)
janux verify                 # agent-surface contract checks (CI-friendly)
janux eval [files...]        # scripted agent-task scenarios against a live app
janux info                   # versions, resolved config and routes — paste into an issue
```

All of these run the `janux` bin that `@janux/cli` installs into your app's `node_modules` — there is no global install. Apps scaffolded by `create-janux` wrap the common ones as package scripts (`bun run dev`); for the rest, prefix with `bunx`: `bunx janux info`.

`PORT` env is honored when `--port` is absent.

`janux start` serves `dist/client` before falling back to the app: compressed with brotli (or gzip, whichever the request accepts), each file compressed once and kept in memory, and cached `immutable` for a year when its name carries a content hash. Behind a CDN that already does this, it costs nothing; on a box without one, it is the difference between shipping a bundle and shipping four of them.

## janux dev

### The error overlay

Every framework can show you the stack of a `throw`. Janux can show you *why the
invocation was there at all* — because every call, from a click or from an
agent, goes through one pipeline that knows who asked and what the guard
decided. When something throws inside an `intent()`, `effect()` or `source()`,
`janux dev` puts that whole sentence on screen:

| row | what it answers |
|---|---|
| `route` | the URL, the pattern it matched, and the route module that answered |
| `layouts` | the `_layout` chain that wrapped it, outermost first |
| `island` | the island instance it landed in (`ui://cart#default`) |
| `intent` / `effect` / `source` | the declared behavior that ran, as the agent surface names it |
| `guard` | what the guard resolved to **for this caller** — `auto`, `confirm`, `forbidden` |
| `origin` | `human` for a DOM interaction, `agent` for a call through the agent surface |
| `input` | the validated input the invocation carried |

Under it, the full JS stack. Sourcemaps are on in dev (the framework's own
frames included, so the trace does not stop at your app's edge), so DevTools
resolves every frame back to your source.

The overlay never swallows anything: the original error object is logged to the
console as well, exactly as thrown. Press `Esc` to dismiss it.

An error that did not come through the pipeline — a plain uncaught `TypeError` —
still gets a panel with its route and stack, and says so instead of inventing a
chain it does not have.

> **Dev only, and measurably so.** The overlay is behind `import.meta.env.DEV`,
> which `janux build` eliminates: not one byte of it reaches a production
> bundle, and `packages/janux-cli/src/bundle-size.test.ts` proves it by building
> the same app twice — once normally, once with the dev guards forced on.

Production builds emit `hidden` sourcemaps: `.map` files are written next to the
bundle for an error tracker to consume, with no `sourceMappingURL` appended, so
the browser never downloads them.

## janux info

Everything a bug report needs, as markdown you can paste into an issue
unedited — versions, the resolved config, which adapters and zero-config
integrations are actually installed, and every route the file-system router
found:

```bash
bunx janux info
```

```markdown
### janux info

| | |
|---|---|
| janux | 0.5.0 |
| @janux/cli | 0.5.0 |
| bun | 1.3.14 |
| os | darwin 25.5.0 (arm64) |
| app | janux-example-shop 0.2.1 |

**Resolved config** (paths relative to the app root)
…
**Integrations**

| | |
|---|---|
| @janux/tailwind | not installed |

**Routes** (3)

| route | module | layouts |
|---|---|---|
| `/shop` | src/routes/shop.tsx | — |
```

Installed-but-invisible is the reason it exists: zero-config integrations are
configured *by being installed*, so nothing in your own source says whether
Tailwind is on. Paths are reported relative to the app root and the root itself
is never printed — there is nothing to redact before posting.

## janux test

`bun test`, run from the app root. Everything after the command name goes through verbatim — file filters, `--watch`, `--coverage`, `-t` — and the exit code is the suite's. Janux does not ship a test runner: `bun:test` covers components and routes (see [`@janux/testing`](/docs/reference/testing-api)), Playwright covers the browser. The command exists so every project drives its suite the same way, whatever the package manager scripts look like.

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
and exits 1 when the regression gate fails — with one trial (the default),
that is any failed expectation.

```bash
janux eval --start "janux start"        # boots the app, runs, stops it
janux eval --url http://localhost:3000  # against a server you manage
janux eval evals/checkout.eval.json --json
janux eval --trials 2                   # gate only on reproducible failures
janux eval --baseline evals/baseline.json  # compare against a committed run
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
`input`, `approve` or `reject`. An `approve` step exercises the real
human-in-the-loop flow (`POST /_janux/approve`) — the same pipeline your UI
uses — and a `reject` step its mirror (`POST /_janux/reject`), answering
`{ "ok": true }` when the proposal existed and `{ "ok": false }` once settled.
`expect` checks any of `ok` (default `true` when omitted), `status`, `error`
(substring) and `result` (deep subset match).

Inside `result`, four matchers extend the positional subset match:
`{ "$some": {…} }` passes when *any* item of an array matches, `{ "$not": {…} }`
inverts a match, `{ "$contains": "…" }` matches a substring of a string (how a
tool result, which travels as JSON text, is asserted), and the value
`"$absent"` requires the field to be missing. All three wrappers are
single-key — never mixed with literal keys. A
`throw` inside a tool's `run()` surfaces as `{ "ok": false, "status": 500 }`
with `error` starting `"Error: …"`, assertable like any other outcome.

A step can also be a whole agent turn: `{ "turn": "Add two units of p1",
"path": "/shop" }` POSTs the message to `/_janux/agent` and the reply envelope
is the outcome (`result` matches `type`, `calls`, `messages`…), with the
turn's token `usage` (and `costUsd` when the app declared its model's cost)
accounted per scenario and per run. A turn is `ok` only when the agent
answered — `text` or `ui_calls`, and not the `stopReason: "max_turns"` give-up.
An unconfigured model (`setup`), a refusal, a provider failure and an exhausted
loop are **not** ok, so a run without a key fails loudly instead of passing
green; assert those on purpose with
`{ "ok": false, "result": { "type": "refusal" } }`.

Scenario files run sorted by filename, and a scenario with `"reset": true`
reboots the `--start` app first, so it starts from seed state (without
`--start`, `reset` is ignored). With `--json` the booted app's stdout is
silenced — the report is the only thing on stdout, safe to pipe.

`--trials N` replays the whole set N times and the gate fails **only on
scenarios that fail every trial** — a real regression reproduces, a wobble
does not block. The verdict (which scenario, how many trials, which step)
goes to stderr and, structured, to `eval-gate.json`. Above one trial each
stdout report also carries its `trial` index, so the extra dimension is
legible rather than a silently duplicated name; at the default single trial
the JSON is unchanged.

Every run is appended to `.janux/evals/history.jsonl` with its metadata
(commit, the model that actually answered, date, usage), and the end of the
run compares against the previous one — or against `--baseline <file>` —
saying what improved, what regressed and what it cost. Costs are compared
**per trial**, so a nightly on `--trials 3` is not a permanent 3× regression
against a single-trial baseline. A `--baseline` that cannot be read as a run
record is an error, never silence: a renamed baseline must not quietly stop
comparing. The [agent evals in CI](/docs/recipes/agent-evals-in-ci) recipe
wires all of it into a workflow.

## create-janux

```bash
bun create janux my-app                    # the starter app
bun create janux my-shop --example shop    # start from any examples/ app
```

`--example <name>` scaffolds a copy of one of the [example apps](/docs/more/examples) (`shop`, `i18n`, `interop-react`, `nested-islands`, `data-cache`) instead of the starter template; omit the name to list them. `bunx create-janux` is the same command.

The starter template scaffolds the conventional layout with a resumable counter island, an agent panel and an example unit test.

## Project conventions

Everything is convention over configuration — each of these is optional:

| Path | Purpose |
|---|---|
| `src/routes/**` | File-system routing (`index.tsx` → `/`, `[id].tsx` → `:id`) |
| `src/server/*.api.ts` | api() modules → endpoints + client stubs + agent tools |
| `src/stores.ts` | Store defs available during SSR |
| `src/agent.ts` | `export default defineAgent({...})` |
| `src/i18n.ts` (or `src/i18n/index.ts`) | `export default` an `I18nConfig` — activates [internationalization](/docs/guide/i18n) |
| `src/ctx.ts` | `export default` a `(req) => ctx` — per-request [context and auth](/docs/recipes/auth-and-context) |
| `src/middleware.ts` | `export default` a `(req) => Response \| undefined` — runs before routing |
| `src/matchers.ts` | Named exports = custom `[param=matcher]` matchers |
| `src/client.ts` | `boot({ defs })` — omit for fully static apps (0 KB JS) |
| `src/styles.css` | App stylesheet, linked automatically |
| `public/` | Static assets served at `/` (favicon.svg auto-linked) |
| `janux.config.ts` | Optional app config (`title`, `llmsTxt`, `output`, …) — same shape as the Vite plugin options, which win over it |

```ts
// janux.config.ts
import { defineConfig } from 'janux';

export default defineConfig({
  llmsTxt: { title: 'My App', description: 'What agents should know.' },
  output: 'static',
});
```

> A `"janux"` field in `package.json` still works as a deprecated fallback; `janux.config.ts` wins over it.

### All config fields

Everything is optional — the defaults are the [conventional layout](#project-conventions). Override a field only to move things off-convention. The Vite plugin accepts the same shape and wins over `janux.config.ts`.

| Field | Default | Purpose |
|---|---|---|
| `title` | — | Default document title / shell title |
| `lang` | `'en'` | `<html lang>` for the whole app. An [i18n](/docs/guide/i18n) app ignores it: each page declares its own locale and direction |
| `siteUrl` | — | Public origin (`https://janux.dev`). Resolves a route's relative `image`/`canonical` into the absolute URLs Open Graph needs (see [PageMeta](/docs/reference/server-api)), and opts into `/sitemap.xml` + `/robots.txt` |
| `llmsTxt` | off | `{ title?, description? }` — opt into serving `GET /llms.txt` |
| `feed` | off | `{ title?, description?, items }` — opt into serving `GET /rss.xml`. `items()` returns `{ url, title, description?, date?, author? }[]`, typically a [content collection](/docs/guide/content-collections) mapped, newest first. Needs `siteUrl`; every page advertises the feed with a `rel="alternate"` link |
| `inlineStyles` | `false` | Inline the built stylesheet into every page instead of linking it: one less render-blocking round trip before the first paint, at the cost of a cacheable request. Production only — dev keeps the link so CSS hot-reload works |
| `csp` | off | `true` for a strict [Content Security Policy](/docs/recipes/csp): a fresh nonce per request on every inline script and style the framework emits, plus the header. `{ nonce?, header? }` to bring your own. Ignored by `output: 'static'`, which has no per-request anything |
| `output` | `'bun'` | `'bun'` or `'static'` — see [output](#output) |
| `routesDir` | `src/routes` | File-system routing root |
| `serverDir` | `src/server` | Where `*.api.ts` modules are discovered |
| `clientEntry` | `src/client.ts` | Client `boot()` entry; absent → fully static app, 0 KB JS |
| `agentModule` | `src/agent.ts` | `defineAgent()` default export; absent → the built-in default agent |
| `storesModule` | `src/stores.ts` | Store defs available during SSR |
| `websocket` | `src/ws.ts` | Module whose default export is the first-class WebSocket endpoint (`{ path, ...handlers }`) — `janux dev` and `janux start` upgrade it themselves ([custom server](/docs/recipes/custom-server#first-class-websockets)) |
| `mcpAuth` | off | `{ tokenEnv?, token?, resourceMetadataUrl? }` — bearer-protect `POST /_janux/mcp`; `tokenEnv` names the env var read at boot and wins over the literal `token`. The GET landing stays public and prints `$TOKEN`-placeholder connect commands |
| `agents` | off | `{ webBotAuth: { keys }, policy? }` — Web Bot Auth agent verification (see [Server API](/docs/reference/server-api)) |

## output

| Value | Meaning |
|---|---|
| `"bun"` (default) | `janux start` serves the app on a Bun server |
| `"static"` | `janux build` also prerenders every page into `dist/client` (`/docs/x` → `docs/x/index.html` + `docs/x.md`, plus `llms.txt` and, from `_404.tsx`, `404.html`) — deploy to any static host, no server. Dynamic routes need `staticParams` ([Route modules](/docs/reference/server-api)); those without it are skipped with a warning |

More output targets will come later. Full walkthrough: [Deploying → Static export](/docs/recipes/deploying).

## Programmatic use

`@janux/cli` is also a module: `runCli(argv)` is what `bin.ts` calls, `parseArgs(argv, cwd)` parses a command line into `{ command, root, port, … }`, and `HELP_TEXT` is the usage string.

```ts
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from '@janux/cli';

const server = createJanuxServer(await prodServerOptions(process.cwd()));
```

`prodServerOptions(root)` resolves an app's conventions into the `ServerOptions` that `janux start` uses — routes, `*.api.ts` modules, stores, agent, i18n, per-request `ctx`, middleware, matchers, `src/api/**` handlers, the built `client.js` and stylesheet. Spread it to override individual fields. It expects `janux build` to have run (that's where `dist/client/client.js` comes from) and it does **not** serve static files: see [custom server](/docs/recipes/custom-server).

## Environment

| Variable | Purpose |
|---|---|
| `JANUX_MODEL` | `provider/model` for the copilot |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Provider auth (also drives model sniffing) |
| `PORT` | Server port |

> **Note:** `janux start` runs your TSX directly on Bun — there is no server build step. `janux build` only bundles client assets.
