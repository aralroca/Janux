// Derived from octane/benchmarks (MIT) — Copyright (c) 2026 Dominic Gannaway. See benchmarks/LICENSE-OCTANE.
process.env.OCTANE_HYDRATION_STRESS = '1';
await import('../news/hydration-interactivity.mjs');
