# Large controlled forms

This benchmark drives the same production-built, 512-field controlled form in
Octane, React, Preact, Solid 2, Svelte, and Vue Vapor with real Playwright mouse
and keyboard input.

Correctness checks preserve the original input, focus, caret, typed value, and
rendered output. They also exercise checkbox, radio, select, conditional
sections, complete form submission, reset, and generation-guarded asynchronous
validation. Stale validation results must never overwrite the latest value.
Field-render counts are reported for comparison without assuming that different
renderers must use the same update strategy.

```bash
node benchmarks/bench.mjs --quick controlled-form
node benchmarks/bench.mjs controlled-form
```

---

Suite harness and prose derived from [octane](https://github.com/octanejs/octane)`/benchmarks` (MIT — Copyright (c) 2026 Dominic Gannaway). Full licence text: [`../LICENSE-OCTANE`](../LICENSE-OCTANE) · attribution: [`../../CREDITS.md`](../../CREDITS.md). Where the text above names *Octane* as a measured target, read *Janux*: this suite measures Janux against react/preact/solid/svelte/vue-vapor, and the upstream name survives in inherited prose.
