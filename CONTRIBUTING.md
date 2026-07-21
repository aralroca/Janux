# Contributing to Janux

Thanks for your interest! Janux is early and moving fast — issues, [RFC discussion](https://github.com/aralroca/Janux/issues/1) and PRs are all welcome.

## Setup

```bash
git clone git@github.com:aralroca/Janux.git
cd Janux
bun install
bun test packages     # everything should be green before you start
```

Requirements: [Bun](https://bun.sh) ≥ 1.3. No other global tooling.

## Repository layout

- `packages/janux` — core (schema, signals, runtime, SSR, client resume, manifest)
- `packages/janux-server` / `janux-agent` / `janux-vite` / `janux-cli` / `create-janux`
- `apps/docs` — the documentation site, built with Janux (dogfooding)
- `examples/shop` — reference example

## Development loop

```bash
bun test packages                 # full suite
bun test packages/janux/src/...   # one file while iterating
bun run typecheck                 # tsc over all packages
bun run --cwd examples/shop dev   # manual testing against the example
```

## Rules of the codebase

These are enforced in review:

1. **Test first.** Bug fixes reproduce the bug in a test before fixing it. Features land with tests for the new behavior. Framework guarantees (0-JS static pages, resume-without-hydration, guard semantics) are asserted in the suite — don't weaken those tests.
2. **Declarative over imperative.** Array methods over index loops and accumulators; early returns over flags.
3. **No `void` operator.** Ignore promises explicitly with `.catch(...)`.
4. **Small units.** Max ~200 lines per file, ~10 lines per function body. If you exceed it, extract and name the pieces.
5. **AST work uses SWC.** Any build-time transform or analysis goes through `@swc/core` — never Babel.
6. **Schema-typed state is sacred.** Anything that would put non-JSON data in component state, or mutate state outside a `run()` body, breaks serialization/resume/agent guarantees and will be rejected.
7. **Honest docs.** If a capability is roadmap, the docs say so. Never document the RFC as if it were implemented.

## Pull requests

- Branch from `main`, one coherent change per PR.
- `bun test packages` and `bun run typecheck` must pass.
- Explain *why* in the PR description; link the RFC section if the change touches the component model.
- Public API changes should reference or amend [RFC 0001](https://github.com/aralroca/Janux/issues/1) — the RFC is the design source of truth.

## Reporting bugs

Include: minimal reproduction (a failing test is ideal), expected vs actual behavior, and `bun --version`. Security issues: see [SECURITY.md](SECURITY.md) — do not open a public issue.
