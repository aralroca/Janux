# Janux benchmarks

Multi-framework benchmark suites measuring Janux against react, preact, solid,
svelte 5 and vue-vapor. **Derived from
[octane](https://github.com/octanejs/octane)'s benchmark harness** (MIT,
Copyright (c) 2026 Dominic Gannaway — full text in `LICENSE-OCTANE`, attribution
in the repo-root `CREDITS.md`); the `js-framework` fixtures derive upstream from
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
(Apache-2.0).

## Running

```bash
bun run bench                      # every suite, normal iterations
bun run bench --quick js-framework # one suite, smoke iterations
bun run bench --record             # refresh local absolute baselines
bun run bench --compare            # fail on regression vs local baselines
bun run bench --ratios             # committed ratio guards (the CI gate)
node benchmarks/report.mjs         # results → markdown position report
```

Requirements: `bun install` at the repo root, Chromium for Playwright
(`bunx playwright install chromium`), `curl` and `lsof` on PATH.

- **Absolute baselines** (`--record`/`--compare`, `baselines/local/`) are
  LOCAL-ONLY: timings are a property of the recording machine.
- **Ratio guards** (`baselines/ratios.json`) compare two targets measured in
  the same run on the same machine, so shared variance cancels — that is the
  only check CI runs (`.github/workflows/bench.yml`, weekly + on demand).
- A harness **correctness gate** failure is fatal: performance may be tolerant,
  correctness may not. Time-boxed waivers live in `HARNESS_FAILURE_ALLOWLIST`
  in `bench.mjs`.

## Suites

Browser suites (production build + `vite preview` + Playwright):
`js-framework`, `js-framework-reorder`, `todomvc`.

Build-based browser suites (the harness builds and serves each target itself):
`news`, `hydration-interactivity`, `hydration-stress`, `store-selector-fanout`,
and the runtime-stress family — `lifecycle-memory`, `controlled-form`,
`external-store-fanout`, `external-store-integrations`,
`scheduler-responsiveness`, `suspense-recovery`, `event-delegation`,
`application-composition`, `scaling-curves` (all driven by
`news/runtime-stress.mjs` over the `news/<target>` fixtures).

Node-only suites (no browser): `ssr-throughput`, `streaming-ssr`,
`bundle-size`.

Octane-only suites (compiler, Lynx, Three, deopt twins…) were not ported.

## Adding a framework fixture

1. Create `benchmarks/<suite>/<name>/` with `package.json` (unique name,
   `dev`/`build`/`preview` scripts on a free `--strictPort` port for browser
   suites), a `tsconfig.json` (fixtures inherit the monorepo root's
   `jsxImportSource: "janux"` otherwise — non-janux fixtures MUST override it),
   and the fixture source honoring the suite harness's DOM/export contract
   (read the suite's `run.mjs` header).
2. Register the target in the suite's `run.mjs` TARGETS and, for browser
   suites, the server in `bench.mjs`'s manifest.
3. Frameworks without a synchronous commit after a dispatched event must expose
   `window.__benchFlush = () => Promise` (Janux: `client.settled()`).
4. Keep the deterministic machinery byte-identical (mulberry32 seeds, shared
   datasets) — identity gates replay it.

## Baseline machine

Local baselines and any published numbers were recorded on:

| | |
|---|---|
| Machine | Apple M4 Pro, 24 GB RAM |
| OS | macOS 26.5.2 |
| Node | v26.4.0 |
| Bun | 1.3.14 |
| Chromium | Playwright 1.62 (Chrome Headless Shell 151) |
