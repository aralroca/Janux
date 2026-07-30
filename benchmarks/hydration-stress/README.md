# Hydration stress

This suite extends the production six-framework hydration benchmark with real
keyboard activation while the client hydration chunk is withheld and Chromium
is CPU-throttled 6×. It also reruns uncontrolled and controlled typing, focused
DOM adoption, pointer replay, and exact search-and-Send delivery.

Each activation records whether the event was replayed, handled by React's real
selective-hydration root, or dropped. Reference-framework capability gaps are
published explicitly; Octane must deliver every interaction exactly once.

```bash
node benchmarks/bench.mjs --quick hydration-stress
node benchmarks/bench.mjs hydration-stress
```

---

Suite harness and prose derived from [octane](https://github.com/octanejs/octane)`/benchmarks` (MIT — Copyright (c) 2026 Dominic Gannaway). Full licence text: [`../LICENSE-OCTANE`](../LICENSE-OCTANE) · attribution: [`../../CREDITS.md`](../../CREDITS.md). Where the text above names *Octane* as a measured target, read *Janux*: this suite measures Janux against react/preact/solid/svelte/vue-vapor, and the upstream name survives in inherited prose.
