// Derived from octane/benchmarks (MIT) — Copyright (c) 2026 Dominic Gannaway. See benchmarks/LICENSE-OCTANE.
process.env.OCTANE_RUNTIME_STRESS_SUITE = 'application-composition';
await import('../news/runtime-stress.mjs');
