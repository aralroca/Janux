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
full position report. Numbers below are from a full run on 2026-08-02 — Apple
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
| News page: make interactive | **0.39ms** | 2.86ms | 1.91ms | 2.12ms | 1.66ms | 1.90ms |
| Hydration, 6× CPU throttle | **10.70ms** | 57.62ms | 18.76ms | 26.80ms | 27.44ms | 24.76ms |
| Hydration work on the main thread (6×) | **5.26ms** | 19.88ms | 13.16ms | 20.86ms | 17.12ms | 18.14ms |
| Controlled page, 6× throttle | **12.12ms** | 58.22ms | 18.16ms | 27.32ms | 29.28ms | 25.22ms |

**Fine-grained updates.** `<For>` gives every row its own reactive scope and
`class={() => …}` binds a single attribute, so a change costs what it changed
rather than one whole-island render ([keys and lists](/docs/guide/keys-and-lists),
[`<For>`](/docs/reference/for)):

| krausest op (1,000 rows) | janux | react | preact | solid | svelte | vue-vapor |
|---|---|---|---|---|---|---|
| swap rows | **1.10ms** | 3.98ms | 0.44ms | 0.24ms | 0.36ms | 0.22ms |
| create 10,000 rows | **68.94ms** | 136.86ms | 57.98ms | 15.60ms | 26.74ms | 18.20ms |
| clear 10,000 rows | **38.40ms** | 41.74ms | 36.54ms | 25.58ms | 30.36ms | 24.38ms |
| reverse | **1.95ms** | 2.24ms | 2.08ms | 1.10ms | 16.04ms | 1.43ms |
| rotate last to front | **0.51ms** | 1.51ms | 0.17ms | 0.09ms | 0.13ms | 0.67ms |

**Shipped bytes vs the React baseline.** The full Janux client runtime —
signals, reconciler, delegated events, resume, the agent bridge — is 30.6KB
gzip; the same krausest app ships 32.5KB total against react's 60.7KB. Pages
with no islands ship no JavaScript at all, which no suite here can even
express.

| js_gzip, krausest app | preact | solid | svelte | vue-vapor | **janux** | react |
|---|---|---|---|---|---|---|
| total | 9.8KB | 13.7KB | 17.9KB | 23.5KB | **32.5KB** | 60.7KB |

**Whole-app parity and wins.** Resetting a 512-field form: 14.74ms against
react's 38.64 (preact 40.84, solid 36.02). Typing into 512 controlled fields:
16.84ms vs react's 45.58. A burst of 128 delegated events: 10.72ms vs react's
18.12. Mount/update/unmount lifecycle cycles land at react's number with exact
cleanup accounting (49.35ms vs 49.56), and a 512-subscriber selector store runs
**zero selector calls** across 20 unrelated parent re-renders.

## Where Janux does not win (yet)

Honest numbers, with the cause understood. Across the 19 suites, **88 of 156
janux/react cells are ahead of react and 68 are behind**; the full signed table
is in
[`benchmarks/BASELINE-2026-07.md`](https://github.com/aralroca/Janux/blob/main/benchmarks/BASELINE-2026-07.md).

- **Building rows in bulk.** Creating 1,000 rows costs 6.56ms against react's
  4.88 and solid's 1.90. A Janux row carries an Owner, a signal and an effect
  so it can update in isolation; solid's rows are compiled templates with none
  of that bookkeeping. The reorder ops sit at ~0.5ms against react's 0.15 for
  the same reason — the floor is the keyed diff plus the per-row scope, not the
  DOM move.
- **Island boot.** Making a throttled page interactive after an interaction
  takes 10.34ms against react's 4.06 — Janux wins the end-to-end hydration rows
  by 5× but pays more for the first island it wakes.
- **Selecting one row among 1,000** costs 0.82ms where react-with-memo pays
  0.30 and solid 0.04. The binding rewrites exactly one attribute per row now;
  what remains is a thousand effect invocations.
- **SSR throughput.** Rendering the 50-card news page takes 0.26ms against
  react's 0.07. Streaming end-to-end is at parity (50.86ms vs 51.06 on the
  staggered schedule, out-of-order boundary swaps included) because data
  latency dominates, but the shell's time-to-first-byte is 1.40ms against
  react's 0.06: Janux waits one turn per suspense boundary to see whether its
  content settles, and inlines it when it does.
- **App bytes for TodoMVC**: 1.3KB gzip against react's 1.1KB. Every Janux
  intent carries a schema and a description, because the MCP tools agents call
  are generated from them.
- **One extra DOM element per island.** The `<janux-island>` host is the
  resumability boundary, so the node census reads 10,073 against react's
  10,072.

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
