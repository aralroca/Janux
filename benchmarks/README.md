# Janux benchmarks

Multi-framework benchmark suites measuring Janux against react, preact, solid,
svelte 5 and vue-vapor. **Derived from
[octane](https://github.com/octanejs/octane)'s benchmark harness** (MIT,
Copyright (c) 2026 Dominic Gannaway — full text in `LICENSE-OCTANE`, attribution
in the repo-root `CREDITS.md`); the `js-framework` fixtures derive upstream from
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
(Apache-2.0).

## What is borrowed and what is ours

Read this table before citing anything in here. **Most of this directory is
Octane's work, not Janux's** — 21 of its 22 suite directories exist upstream, and
the harness is a direct code derivation rather than a reimplementation.

| Path | Origin | Notes |
|---|---|---|
| `LICENSE-OCTANE` | **Octane**, verbatim | Upstream MIT licence, byte-identical to `octane/LICENSE` |
| `lib/*.mjs` | **Octane**, verbatim | stats, DOM census, HTTP timing, stream verification, precise-work probes |
| `bench.mjs` | **Octane**, adapted | Runner; retrimmed for Bun workspaces and Janux's suite list (~94% of its lines are upstream) |
| `<suite>/run*.mjs`, `news/*.mjs`, `*/shared.js` | **Octane**, verbatim → lightly adapted | Per-suite harnesses; still carry Octane's `OCTANE_*` env-var names |
| `<suite>/README.md` | **Octane**, verbatim | Suite prose. Some still name *Octane* as the framework under test — inherited text, not a Janux target |
| `<suite>/{react,preact,solid,svelte,vue-vapor}/` | **Octane**, verbatim | Rival fixtures. `js-framework` traces upstream to krausest (Apache-2.0), `todomvc` to the [TodoMVC](https://todomvc.com) spec |
| `<suite>/janux/` | Janux, on Octane's contract | Written against Janux's API, but structurally parallel to the upstream fixtures they replace (~25–45% line overlap) |
| `baselines/`, `results/` | Janux's measurements, Octane's schema | Numbers are ours; the file shape and ratio-guard format are upstream |
| `report.mjs`, `report.test.mjs` | **Janux, original** | Results → markdown position report; no upstream counterpart |
| `BASELINE-2026-07.md` | **Janux, original** | Measured baseline and the optimization log |

Octane keeps **no per-file copyright headers** upstream, so nothing here lost
one; the `// Derived from octane/benchmarks (MIT) …` lines on the harness files
were added by Janux, above what MIT requires.

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
