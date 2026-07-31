---
title: Benchmarks
description: "Janux measured against React, Preact, Solid, Svelte and Vue Vapor across 19 multi-framework suites: client runtime, hydration, SSR and memory."
---

# Benchmarks

Janux measured against react 19.2, preact 10.29, solid 2.0-beta, svelte 5.56
and vue-vapor 3.6-rc across 19 multi-framework suites — client runtime,
hydration, SSR, streaming and shipped bytes. The harness is a direct port of
[octane](https://github.com/octanejs/octane)'s benchmark infrastructure (MIT,
Dominic Gannaway — see the credits below), whose correctness gates are the
point: a framework that posts numbers must first prove the DOM it produced is
right, keyed rows kept their identity, focus and caret survived, and every
mount got its cleanup.

Everything here is reproducible from
[`benchmarks/`](https://github.com/aralroca/Janux/tree/main/benchmarks) in the
repo: `bun run bench` runs the suites, `node benchmarks/report.mjs` renders the
full position report. Numbers below are from a full run on 2026-07-29 — Apple
M4 Pro, 24 GB, macOS 26.5, Node 26, Bun 1.3, Chromium 151 headless. Absolute
milliseconds are a property of that machine; the ratios are the claim, and CI
re-checks a committed set of ratio guards weekly.

## Where Janux wins

**Resume instead of hydration.** A Janux page becomes interactive by reading
its serialized state snapshots and installing delegated listeners — no
component re-execution, no event replay. That design shows up everywhere the
hydration suites measure it:

| | janux | react | preact | solid | svelte | vue-vapor |
|---|---|---|---|---|---|---|
| News page: make interactive | **0.33ms** | 2.58ms | 1.75ms | 1.87ms | 1.56ms | 1.85ms |
| Hydration, 6× CPU throttle | **10.7ms** | 52.6ms | 18.4ms | 24.6ms | 26.9ms | 21.6ms |
| Hydration work on the main thread (6×) | **4.1ms** | 17.5ms | 13.1ms | 19.3ms | 15.7ms | 15.1ms |

**Shipped bytes vs the React baseline.** The full Janux client runtime —
signals, reconciler, delegated events, resume, the agent bridge — is 22.2KB
gzip; the same krausest app ships 24.2KB total against react's 60.7KB. Pages
with no islands ship no JavaScript at all, which no suite here can even
express.

| js_gzip, krausest app | preact | solid | svelte | **janux** | vue-vapor | react |
|---|---|---|---|---|---|---|
| total | 9.8KB | 13.7KB | 17.9KB | **24.2KB** | 23.5KB | 60.7KB |

**Mass DOM work.** Creating 10,000 rows: 84.9ms vs react's 131.8 (solid 15.4,
svelte 27.6). Clearing them: 36.0ms vs react's 48.4. Resetting a 512-field
form: 15.4ms vs react's 39.0.

**Whole-app parity.** On the application-shaped suites the gap to the
compiled frameworks mostly disappears: mount/update/unmount lifecycle cycles
at 1.00× react with exact cleanup accounting, zustand/jotai/TanStack Query
integration ops between 0.83× and 1.14× (one outlier: TanStack invalidation
at 1.62×), suspense error/retry/cancel recovery between 1.01× and 1.10×, a
512-subscriber selector store with **zero selector calls** across 20
unrelated parent re-renders.

## Where Janux does not win (yet)

Honest numbers, with the cause understood:

- **Sub-millisecond keyed micro-ops.** Selecting one row among 1,000 costs
  7.7ms where react-with-memo pays 0.5ms and solid 0.1ms. A Janux island
  re-runs its whole view per state change; the reconciler now skips unchanged
  subtrees and moves keyed rows with minimal LIS insertions, but rebuilding
  the view's JSX is still O(list). Going sub-millisecond needs a fine-grained
  list primitive (a `<For>` with per-row reactive scopes) — an authoring
  surface change under RFC.
- **SSR throughput.** Rendering the 50-card news page takes 0.39ms against
  react's 0.09 (4.5×). Streaming end-to-end is at parity (50.7ms vs 51.3 on
  the staggered schedule, out-of-order boundary swaps included) because data
  latency dominates, but the string-emission pipeline is the next server-side
  target.
- **Programmatic event bursts.** 128 synthetic events in a tight loop cost
  145ms (react 17.9): each delegated intent pays schema validation plus a
  microtask chain. Invisible at human interaction rates, measurable in bursts.

## What the benchmarks already paid for

Porting the harness found and fixed real framework issues before any tuning
started: intent bodies now batch to one reactive flush (a krausest `update`
was 1816ms before, 7.2ms after), keyed morph landed because the reorder
suite's node-identity gate demanded it, and the SSR chunk coalescer was
rewritten after the throughput suite's sustained-render loop exposed unbounded
retention (~800KB pinned per render, OOM; now flat). The full optimization
log, including the attempts that didn't survive, lives in
[`benchmarks/BASELINE-2026-07.md`](https://github.com/aralroca/Janux/blob/main/benchmarks/BASELINE-2026-07.md).

## Credits

The harness, suites and rival fixtures derive from
[octane](https://github.com/octanejs/octane)'s benchmarks (MIT, Copyright (c)
2026 Dominic Gannaway) — runner, statistics, correctness-gate methodology and
the ratio-guard CI model are theirs. The `js-framework` fixtures derive
upstream from
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
(Apache-2.0). Full notices in `benchmarks/LICENSE-OCTANE` and
[`CREDITS.md`](https://github.com/aralroca/Janux/blob/main/CREDITS.md).
