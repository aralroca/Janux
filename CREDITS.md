# Credits

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

Licenses are reproduced by the projects themselves at the links above; this file
is the attribution for the ideas we borrowed.
