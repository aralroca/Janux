# Versioning and support

Janux is 0.x. This file says what that costs you, how long a version keeps working, and what would have to be true
for a 1.0 to exist. [STABILITY.md](./STABILITY.md) says the same thing per API; [CHANGELOG.md](./CHANGELOG.md) says
what actually happened.

## One version, eight packages

`janux`, `@janux/server`, `@janux/agent`, `@janux/vite`, `@janux/tailwind`, `@janux/cli`, `@janux/vercel` and
`create-janux` always release together, on the same number. They are one framework split across entry points: the
Vite plugin emits what the client runtime resumes, and the CLI builds what the server serves. A matrix of
independently versioned packages would be a matrix of combinations nobody tests.

So there is one rule for upgrading: **move all of them at once.** Mixing `janux@0.6.0` with `@janux/vite@0.5.0` is
not a supported configuration, and the packages pin each other exactly at publish time so npm will tell you.

## What the numbers mean

Semver's own answer for 0.x — "anything MAY change at any time" — is true and useless. Janux narrows it:

| Bump | Means |
|---|---|
| **Minor** (`0.5.0` → `0.6.0`) | The breaking bump. Something in the table below changed, and the changelog says what and how to migrate. |
| **Patch** (`0.6.0` → `0.6.1`) | Fixes and additions that do not break a documented API. Safe to take without reading anything. |

New features can ship in a patch. That is deliberate: it keeps the minor meaning "read the changelog before you
take this", which is the only signal that matters.

## What can break, and with how much notice

The tier comes from [STABILITY.md](./STABILITY.md), which is generated from the exports themselves.

| Tier | Can break on | Notice you get |
|---|---|---|
| **Stable** | A minor | One full minor of deprecation. The release that deprecates it says so in the changelog, keeps the old behaviour working, and warns at runtime wherever a warning is possible. The release after that may remove it. |
| **Experimental** | A minor | The changelog entry, and nothing before it. Building on an experimental API means reading the changelog on every minor. |
| **Internal** | Any release, including a patch | None. These exist so Janux can be embedded, tested and instrumented; they are documented for that, not promised. |

Three things are outside semver entirely, and change in a patch when they are wrong:

- **Rendered HTML and the wire format** of `/_janux/*`, as long as the documented behaviour is unchanged. The
  roadmap replaces per-island re-render + DOM morph with compile-time binding maps; that is not a breaking change.
- **Type-only exports.** They move with the values that carry them, and a stricter type on a stable API is a patch.
- **Security fixes.** If the only fix for a vulnerability is a break, it ships as a break, in a patch, and says so.

The [four design invariants](./apps/docs/content/guide/architecture-and-roadmap.md#design-invariants) are not on
this table at all. They do not change in 0.x, and changing one is what a major would be for.

## What is supported

- **The current minor** gets everything: fixes, features, security.
- **The previous minor** gets security and data-loss fixes for **90 days** after its successor ships. Nothing else.
- **Everything older** is unsupported. It stays on npm; it is not maintained.

Two minors alive at a time, and no more. This is a small project, and a support matrix it cannot honour is worse
than a short one it can.

Runtimes are part of the contract, and the manifests are the source of truth for it: `@janux/cli` and
`create-janux` declare `bun >= 1.3`, the published packages are ESM and are smoke-tested against Node 24 on every
change, `@janux/vite` needs Vite 5 or newer, and `janux/interop` needs React 18 or newer. Dropping support for a
runtime version is a **minor**, with the same one-minor notice a stable API gets.

## How a release happens

1. Every pull request that changes a published package ships a [changeset](./.changeset/README.md).
2. `bun run release:version` consumes them: it bumps the eight manifests, writes their changelogs, folds them into
   the root `CHANGELOG.md` and syncs the root manifest. That is a normal pull request, reviewed like any other.
3. Merging it and pushing the tag — `0.6.0`, no `v` — is the release.
   [`.github/workflows/release.yml`](./.github/workflows/release.yml) runs the suite, the typecheck, the coverage
   floor and the Node install smoke, then publishes.

Publishing from a laptop is not the fallback, it is refused: `scripts/release.ts` exits unless it can attest
provenance, which needs an OIDC token only a workflow has. That means every tarball on npm carries a signed
statement of the repository, commit and workflow that built it, and `npm audit signatures` can check it.

## What 1.0 will mean

1.0 is not a date and not a maturity claim. It is the point at which the table above stops being generous to
Janux and starts being a promise to you: **a stable API breaks only in a major, and majors are rare.**

Concretely, all of these have to be true before it can be cut:

1. **No experimental entry points in the core three.** `janux`, `@janux/server` and `@janux/cli` are entirely
   stable in `STABILITY.md`. Experimental APIs elsewhere are allowed; a 1.0 that cannot ship anything new is not
   worth having.
2. **The roadmap items that touch the public contract are settled** — resolved or explicitly deferred past 1.0,
   in writing. The ones that do not touch it (the compiler evolution of the render path) do not block anything.
3. **The internal tier is deliberate.** Every export currently classified internal is either promoted with a
   documented contract or moved out of a public entry point. "Internal but importable" is a 0.x compromise.
4. **The documentation backlog stays empty.** `packages/docs-tests` enforces this already: every runtime export of
   every public entry point is covered by a reference page.
5. **A real deprecation has been through the full cycle** — deprecated in one minor, removed in the next, with the
   changelog and the runtime warning that the policy above describes. A policy nobody has executed is a draft.

Until then, this is 0.x, and the honest summary is the one at the top: a minor can break you, the changelog will
tell you how, and the previous minor keeps working for 90 days while you move.
