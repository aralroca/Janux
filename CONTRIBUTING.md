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

## How the packages are published

A package has two shapes, and only one of them is in the file you edit:

- **In the repository**, `main` and `exports` point at `src/*.ts`. That is what makes `workspace:*` work with no build step — `bun test`, `tsc` and every Vite example read your edit directly.
- **In the tarball**, `publishConfig` replaces `main`, `module`, `types`, `exports` and `bin` with compiled paths under `dist/`, because Node refuses to strip types inside `node_modules` and a consumer's `tsconfig` must never type-check our source. `scripts/release.ts` lifts those fields onto the manifest just before packing — npm and Bun do not do it themselves, pnpm does.

So **a new subpath has to be added twice**: to `exports` and to `publishConfig.exports`, with `types` first in the entry. `scripts/packaging/manifest.test.ts` fails if the two disagree, and `bun run smoke:node` installs the real tarballs into a bare Node project and imports every subpath.

```bash
bun run build:packages            # compile to dist/ (SWC per file + tsc declarations)
bun run pack:packages             # build, pack, and read each tarball back
bun run smoke:node                # install the tarballs in a clean Node project
```

## Changesets, and what a release is

A change to a published package ships with a **changeset** — the file that becomes its changelog entry:

```bash
bun run changeset                 # write one, interactively
bun run changeset:status          # what the next release would contain
```

Docs, examples, benchmarks and CI need none. Everything else does, and it is written for the person upgrading:
name the export, say what changed, and if it breaks something say what to do instead. See
[`.changeset/README.md`](.changeset/README.md).

Releasing is two steps and neither of them is your laptop. `bun run release:version` turns the pending changesets
into version bumps and changelogs — that is a reviewable pull request. Pushing the tag it names is what publishes,
via [`.github/workflows/release.yml`](.github/workflows/release.yml), with npm provenance.
`scripts/release.ts` refuses to upload without the OIDC token only a workflow has, so there is no accidental
manual publish to fall back to.

Two documents make promises to users, and a change can break them: [VERSIONING.md](VERSIONING.md) says what a
minor may break, and [STABILITY.md](STABILITY.md) says which APIs those rules apply to. STABILITY.md is
**generated** — `bun run docs:stability` after adding or removing a public export, or the suite fails.

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

## Governance

Janux has one maintainer, [@aralroca](https://github.com/aralroca), who has the final say on design, scope and releases. The bus factor is 1. That is worth knowing before you bet a production app on the framework — and it is part of why contributions are welcome.

Design changes go through an **RFC**: an issue laying out the proposal and its tradeoffs, the way [RFC 0001](https://github.com/aralroca/Janux/issues/1) and [RFC 0002](https://github.com/aralroca/Janux/issues/13) did. Bug fixes, docs and small improvements don't need one — open a PR directly. What the framework promises lives in the docs, so an accepted RFC ships with the docs that describe it (rule 7 above).
