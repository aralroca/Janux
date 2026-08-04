---
title: CLI and deployment
description: The commands a Janux app ships with — dev, build, start, verify and eval — and what each one does on the way to a deployment.
---

# CLI and deployment

## Commands

```bash
janux dev [--port 3000]     # Vite dev server: SSR, HMR, api stubs, agent endpoint
janux build                 # client bundle → dist/client (+ prerendered pages with output: "static")
janux start [--port 3000]   # production server on Bun
janux run   [tool] [--arg]  # invoke an intent or an api() from the terminal
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

1. Serves `dist/client` assets — brotli or gzip depending on what the client accepts, compressed once and cached in memory, with hashed filenames served `immutable` for a year and everything else revalidating. (The docs playground ships 3.15 MB of editor: 0.72 MB of it goes over the wire.)
2. SSRs routes directly — Bun executes your TSX natively, no Vite in production.
3. Exposes the same `/_janux/*` surface as dev.

## Deployment notes

- Any host that runs Bun works: a container, a VM, Railway/Fly-style platforms.
- Set your model config in the environment (`JANUX_MODEL` or a provider key) — see [Agent](/docs/guide/agent-and-copilot).
- The manifest endpoint is public by default; scope it with `ctxFor` (auth) if your tools are sensitive — forbidden/filtered tools never appear for unauthorized contexts.

## Guarding the agent surface

- `janux run` is the terminal face of the agent surface: `janux run` lists every tool the manifest advertises, `janux run <tool> --arg value` invokes one — same guards, same validation, arguments and `--help` generated from the schema each tool already declares. It is how a script or a CI job talks to your own app without writing a client for it; a `confirm` guard prompts on a terminal and **fails** (exit 1) with nobody at one, never auto-approving. Details: [CLI reference](/docs/reference/cli).
- `janux verify` renders every route's manifest and exits 1 when an agent-reachable `intent()` or `api()` has no `description` — wire it into CI so incomplete contracts fail the build instead of degrading conversations silently.
- `janux eval` replays `evals/**/*.eval.json` scenarios against a live app, including `approve` steps that exercise the real human-in-the-loop flow. Details and scenario format: [CLI reference](/docs/reference/cli).

## create-janux

```bash
bun create janux my-app                    # the starter app
bun create janux my-shop --example shop    # start from any examples/ app
```

`--example <name>` scaffolds a copy of one of the [example apps](/docs/more/examples) (`shop`, `i18n`, `interop-react`, `nested-islands`, `data-cache`) instead of the starter template; omit the name to list them. `bunx create-janux` is the same command.

The starter template scaffolds the conventional layout (routes, components, agent, client entry) with a working counter + agent-panel demo.
