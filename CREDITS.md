# Credits

Two kinds of debt, kept apart on purpose: **behaviour we learned** from other
projects' test suites, and **code we actually borrowed**. If you only read one
section, read [Borrowed code](#borrowed-code) — that is where other people's
work lives in this repository.

## Learned behaviour

Janux's conformance corpus (`packages/conformance`) exists because other
frameworks got there first. Years of issues, regressions and failing tests taught
them where a signal graph glitches, where a proxy leaks, which attribute a server
renderer escapes wrong, and which URL a router matches by accident.

**No test code was copied.** Every row in the corpus is written against Janux's
own API; what we took is the *behaviour* being asserted — the input and the
answer a correct implementation must give. Each row carries a `src` field naming
where the case was learnt, in the form `<project>:<suite>#<case>`, so any
assertion can be traced back to the suite that discovered it. Rows marked `janux`
are our own.

We are grateful to, and credit:

| Project | License | What its suites taught us |
|---|---|---|
| [Vue](https://github.com/vuejs/core) | MIT | Reactivity: dependency detachment on conditional reads, equality semantics, scheduler ordering, proxy traps over arrays and exotic keys, SSR attribute rendering |
| [React](https://github.com/facebook/react) | MIT | Server-rendered HTML: attribute tables, escaping per sink, boolean and enumerated attributes, untrusted URLs, reconciliation of keyed children |
| [Solid](https://github.com/solidjs/solid) | MIT | Ownership and disposal: roots, cleanup ordering, `untrack` semantics |
| [Preact](https://github.com/preactjs/preact) | MIT | Signals batching and `peek`; keyed-children diffing |
| [Svelte](https://github.com/sveltejs/svelte) · [SvelteKit](https://github.com/sveltejs/kit) | MIT | Router precedence, layout chains |
| [Qwik](https://github.com/QwikDev/qwik) | MIT | Resumability and state serialization |
| [Marko](https://github.com/marko-js/marko) | MIT | Resume from server-rendered markup |
| [Astro](https://github.com/withastro/astro) | MIT | Routing, endpoints, static output |
| [Next.js](https://github.com/vercel/next.js) | MIT | Route matching, API route semantics, header handling |
| [Nuxt](https://github.com/nuxt/nuxt) | MIT | Routing and layout resolution |
| [Angular](https://github.com/angular/angular) | MIT | Router matchers and redirects; validator edge cases |
| [Fresh](https://github.com/denoland/fresh) | MIT | Island routing |
| [TanStack Query](https://github.com/TanStack/query) | MIT | Cache staleness, in-flight dedupe, retry, garbage collection, invalidation |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | Store subscription and persistence semantics |
| [Brisa](https://github.com/brisa-build/brisa) | MIT | Server rendering, attribute serialization, i18n, action/RPC round-trips |
| [Mastra](https://github.com/mastra-ai/mastra) | Apache-2.0 | Agent tool loops, memory, durable workflows, guardrail processors. Nothing under `ee/` was read — that directory is under a separate commercial license |

## Borrowed code

Everything above is a *behavioural* debt — no code changed hands. What follows is
the opposite: **real code from other projects lives in this repository**, or is
loaded by it at runtime. Each row says where it came from and under what licence.

| Project | License | What we took, and where it lives |
|---|---|---|
| [Octane](https://github.com/octanejs/octane) | MIT — Copyright (c) 2026 Dominic Gannaway | **`benchmarks/` is largely Octane's work.** The harness itself: runner (`bench.mjs`), the `lib/` stats/census/timing/stream-verify libraries, every per-suite harness, the rival-framework fixtures, the suite prose, and the measurement methodology (ratio guards, noise-aware regression rule, correctness gates). 21 of the 22 suite directories exist upstream. Full licence text reproduced verbatim at [`benchmarks/LICENSE-OCTANE`](benchmarks/LICENSE-OCTANE); per-file provenance headers on the harness files; a borrowed-vs-ours table in [`benchmarks/README.md`](benchmarks/README.md) |
| [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) | Apache-2.0 | The krausest operation contract and DOM shape that the `js-framework` fixtures implement, upstream of Octane. The fixtures here are modified relative to upstream. Upstream ships no `NOTICE` file, so Apache-2.0 §4(d) adds no further obligation |
| [TodoMVC](https://todomvc.com) | — (specification) | The application shape the `todomvc` suite compares across frameworks. Only the spec/design is followed; no TodoMVC source or CSS is vendored |
| [Brisa](https://github.com/brisa-build/brisa) | MIT — Copyright (c) 2024 Brisa | Janux's i18n engine is a **port of Brisa's `transCore`** (itself the lineage of [next-translate](https://github.com/aralroca/next-translate), same author as Janux): plurals, interpolation, nested keys, fallbacks and `format-elements`. It lives in `packages/janux/src/i18n/` — reimplemented against Janux's API rather than copied wholesale (roughly 15–30% line overlap with its Brisa counterparts), but the design and semantics are Brisa's. Brisa also appears in the behavioural table above; that row is about its test suites, this one is about its code |
| [diff-dom-streaming](https://github.com/aralroca/diff-dom-streaming) | MIT — Copyright (c) 2024 Aral Roca Gomez | The streaming DOM diff that powers Janux's SPA navigation. A **runtime dependency** (`diff-dom-streaming@^0.6.8` in `packages/janux`), not vendored source — npm ships its licence with the package. Sibling project by Janux's own author; credited here because provenance should not depend on who wrote it |

Where a licence obliges us to reproduce its text alongside the code, we do:
Octane's sits at `benchmarks/LICENSE-OCTANE`. The rest are reproduced by the
projects themselves at the links above, and by npm for the runtime dependency.
