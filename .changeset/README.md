# Changesets

Every user-visible change to a published package ships with a file in this folder. That file is what becomes the
entry in `CHANGELOG.md`, so it is written for someone upgrading, not for the reviewer of the pull request.

```sh
bun run changeset          # write one, interactively
bun run changeset:status   # what the next release would contain
```

A changeset is a markdown file with a front matter naming the packages and the bump:

```md
---
'janux': minor
'@janux/server': patch
---

`renderToStream()` flushes the shell before the page renders.
```

## What to write

- One sentence in the present tense, saying what changed for the person calling the API.
- Name the export. `` `foreign()` now maps callbacks onto intents `` is findable; "improve interop" is not.
- If it breaks something, say what breaks and what to do instead. That sentence becomes the migration note.

## Which bump

The eight published packages are a **fixed group**: they always release together, on one version, because they are
one framework split across entry points. So the bump you pick is a floor, not a per-package decision — the highest
bump in the release is the one they all take.

While Janux is 0.x, `minor` is the breaking bump and `patch` is everything else. [VERSIONING.md](../VERSIONING.md)
explains why, and [STABILITY.md](../STABILITY.md) says which APIs are allowed to break with no deprecation period.

Changes that ship nothing to npm — docs, examples, benchmarks, CI — need no changeset.

## Releasing

`bun run release:version` consumes every file here: it bumps the packages, writes their changelogs, folds them into
the root `CHANGELOG.md` and syncs the root manifest. Publishing is the tag, and the tag is
[`.github/workflows/release.yml`](../.github/workflows/release.yml) — not a laptop.
