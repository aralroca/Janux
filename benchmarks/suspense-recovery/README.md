# Suspense and async recovery

Production browser fixtures independently expose pending, rejected, recovered, and cancelled async states. The harness verifies that errors reach the visible boundary, retries clear the error, superseded slow work cannot overwrite a newer response, and every request is accounted for.

```bash
node benchmarks/bench.mjs --quick suspense-recovery
node benchmarks/bench.mjs suspense-recovery
```

---

Suite harness and prose derived from [octane](https://github.com/octanejs/octane)`/benchmarks` (MIT — Copyright (c) 2026 Dominic Gannaway). Full licence text: [`../LICENSE-OCTANE`](../LICENSE-OCTANE) · attribution: [`../../CREDITS.md`](../../CREDITS.md).
