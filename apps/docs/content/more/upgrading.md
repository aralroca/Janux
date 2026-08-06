---
title: Upgrading Janux
description: What a version bump means in 0.x, the three-step upgrade routine, and where the migration work is already done for you.
---

# Upgrading Janux

Janux is 0.x, and the version numbers are narrower than semver's "anything may change":

| Bump | Means |
|---|---|
| **Minor** (`0.5.0` → `0.6.0`) | The breaking bump. Something documented changed; the changelog says what and how to migrate. |
| **Patch** (`0.6.0` → `0.6.1`) | Fixes and additions that break nothing documented. Safe to take without reading anything. |

New features can ship in a patch — that is deliberate. It keeps the minor meaning exactly one thing: *read the changelog before you take this*. The full policy, including what can break with how much notice per stability tier, is in [VERSIONING.md](https://github.com/aralroca/Janux/blob/main/VERSIONING.md), and the tier of every export is generated into [STABILITY.md](https://github.com/aralroca/Janux/blob/main/STABILITY.md) from the exports themselves.

## The routine

All `@janux/*` packages share one version number, so an upgrade is one bump everywhere:

```bash
bun update janux @janux/vite @janux/server   # …and the rest you use
```

1. **Patch jump?** Done — nothing to read.
2. **Minor jump?** Read the [changelog](https://github.com/aralroca/Janux/blob/main/CHANGELOG.md) entries between your versions. Every breaking change names its migration.
3. **Run the codemods.** For breaks that are mechanical, the release ships the tool that applies them:

```bash
janux upgrade --dry-run   # a unified diff of what the jump would change; writes nothing
janux upgrade             # apply it
```

`janux upgrade` reads the version your app resolves from `node_modules`, compares it with the CLI's own, and runs exactly the codemods that fall in that range — each one idempotent and dry-runnable. The catalog and the rules every codemod obeys are in the [codemods reference](/docs/reference/codemods).

## Deprecations

A **Stable** export gets one full minor of deprecation before removal: the deprecating release keeps the old behavior working and warns at runtime where a warning is possible. **Experimental** exports can change on any minor with only the changelog as notice — building on one means reading the changelog on every minor.

## Coming from another framework?

This page is about moving between Janux versions. For moving *to* Janux, see [Migrating from Next.js](/docs/more/migrating-from-next) and [Migrating from Astro](/docs/more/migrating-from-astro).
