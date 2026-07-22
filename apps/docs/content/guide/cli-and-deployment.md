# CLI and deployment

## Commands

```bash
janux dev [--port 3000]     # Vite dev server: SSR, HMR, api stubs, agent endpoint
janux build                 # client bundle → dist/client (+ prerendered pages with output: "static")
janux start [--port 3000]   # production server on Bun
janux verify                # fail CI when agent-reachable tools lack descriptions
janux eval [files...]       # scripted agent-task scenarios against a live app
```

`PORT` env is honored when `--port` is absent.

## What `dev` does

- Boots Vite with the Janux plugin: JSX runtime (`jsxImportSource: janux`), SSR route loading, and the SWC transform that turns `src/server/*.api.ts` into client fetch stubs.
- Mounts the full Janux server as middleware: pages, `/_janux/api/*`, `/_janux/manifest`, `/_janux/agent`, `/_janux/approve`.

## What `build` produces

- `dist/client/client.js` — your `src/client.ts` entry bundled (runtime + island defs).
- If there is no `src/client.ts`, build is a no-op: your app is fully static and ships 0 KB of JS.
- With `output: "static"` in your app config, `build` also prerenders every page — dynamic routes enumerated by their `staticParams` export — plus `llms.txt` into `dist/client`, ready for any static host with no server. See [Deploying → Static export](/docs/recipes/deploying).

## What `start` runs

A Bun server that:

1. Serves `dist/client` assets.
2. SSRs routes directly — Bun executes your TSX natively, no Vite in production.
3. Exposes the same `/_janux/*` surface as dev.

## Deployment notes

- Any host that runs Bun works: a container, a VM, Railway/Fly-style platforms.
- Set your model config in the environment (`JANUX_MODEL` or a provider key) — see [Agent](/docs/guide/agent-and-copilot).
- The manifest endpoint is public by default; scope it with `ctxFor` (auth) if your tools are sensitive — forbidden/filtered tools never appear for unauthorized contexts.

## Guarding the agent surface

- `janux verify` renders every route's manifest and exits 1 when an agent-reachable `intent()` or `api()` has no `description` — wire it into CI so incomplete contracts fail the build instead of degrading conversations silently.
- `janux eval` replays `evals/**/*.eval.json` scenarios against a live app, including `approve` steps that exercise the real human-in-the-loop flow. Details and scenario format: [CLI reference](/docs/reference/cli).

## create-janux

```bash
bunx create-janux my-app
```

Scaffolds the conventional layout (routes, components, server apis, agent, client entry) with a working counter + copilot demo.
