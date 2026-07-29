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

## Adding an example

Every folder under `examples/` is a claim about the framework, and the suite holds you to it. To add one:

1. **Scaffold** the usual shape: `package.json` (name `janux-example-<dir>`, scripts `janux dev --port 4321` / `janux build` / `janux start --port 4321`, framework deps as `workspace:*`), `tsconfig.json` extending `../../tsconfig.base.json`, `README.md`, `public/favicon.svg`, `src/client.ts`, `src/routes/`, `src/styles.css`. Naming: `with-<feature>` for focused examples, a domain name for full apps.
2. **No workarounds.** If the example needs something the framework can't do, extend the framework first — failing test in `packages/*`, then the fix, then a docs page — and only then use it in the example. An example must never paper over a gap.
3. **Tests are not optional.** The e2e suite (`e2e/`) must gain a dedicated `<name>.e2e.test.ts` exercising what the example demonstrates, using the shared helper (`e2e/support/app.ts`: `ssrApp` for server-only suites, `serveBuilt` + `launchChrome` behind `describe.skipIf(!isBuilt(...))` for browser ones). These guards fail CI until you comply:
   - `e2e/examples-smoke.e2e.test.ts` — discovers every example dir; it must boot, serve `/` and `/_janux/manifest`.
   - `e2e/examples-coverage.test.ts` — every example needs a dedicated suite (or a deliberate entry in `e2e/untested-examples.ts`) and must be listed in `README.md` and `apps/docs/content/more/examples.md`.
   - `bun run typecheck` includes `examples/*`.
   - CI builds every example (discovered matrix) and any example a browser suite gates on with `isBuilt()`/`serveBuilt()`.
4. **README snippets are compiled** by `packages/docs-tests` — code fences must import only what the packages really export.
5. Add a `dev:<name>` script to the root `package.json`.

## Pull requests

- Branch from `main`, one coherent change per PR.
- `bun test packages` and `bun run typecheck` must pass.
- Explain *why* in the PR description; link the RFC section if the change touches the component model.
- Public API changes should reference or amend [RFC 0001](https://github.com/aralroca/Janux/issues/1) — the RFC is the design source of truth.

## Reporting bugs

Include: minimal reproduction (a failing test is ideal), expected vs actual behavior, and `bun --version`. Security issues: see [SECURITY.md](SECURITY.md) — do not open a public issue.
