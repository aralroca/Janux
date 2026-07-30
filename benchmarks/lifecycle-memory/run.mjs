// Derived from octane/benchmarks (MIT) — Copyright (c) 2026 Dominic Gannaway. See benchmarks/LICENSE-OCTANE.
process.env.OCTANE_RUNTIME_STRESS_SUITE = 'lifecycle-memory';
await import('../news/runtime-stress.mjs');
