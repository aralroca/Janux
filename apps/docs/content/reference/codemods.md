---
title: Codemods & `janux upgrade`
description: The catalog of codemods Janux ships, how janux upgrade picks the ones a version jump needs, and the two rules every codemod here obeys.
---

# Codemods & `janux upgrade`

Janux is 0.x, so a minor is the breaking bump. [STABILITY.md](https://github.com/aralroca/Janux/blob/main/STABILITY.md) says what that costs per API and promises that a stable export is deprecated before it goes. This page is the other half of that promise: for the breaks that cannot be absorbed by a deprecation, the release ships the tool that applies them.

A framework that reserves the right to break on a minor and leaves the migration to the reader is charging its users for its own freedom to move.

## Two rules

Every codemod here obeys both, and the suite enforces both for every one of them:

1. **`--dry-run` is always available.** It prints a unified diff of exactly what would be written, and writes nothing. It is not a second code path — the same plan is rendered instead of applied, so what you review is what you get.
2. **Running it twice is the same as running it once.** Codemods get run twice: once by accident, once because a merge brought half a tree back. Every before/after fixture in the suite is applied a second time and asserted to change nothing further.

Neither is a style preference. A codemod is asking to edit a source tree it did not write.

## `janux upgrade`

Runs the codemods for the breaking changes between the version you are on and the version you are moving to.

```bash
janux upgrade --dry-run              # what the jump would change
janux upgrade                        # apply it
janux upgrade --from 0.4.0 --to 0.6.0
```

`--from` defaults to the `janux` your app actually resolves (read from `node_modules`), and `--to` defaults to the version of the CLI you invoked — so after bumping the dependency, `janux upgrade` on its own is usually right. It reports the range and the codemods it selected before touching anything:

```txt
Upgrading 0.4.0 → 0.6.0: 0.5.0/events-by-name
```

The boundary is half-open: a codemod runs when its release is **after** `--from` and **at or before** `--to`. An app already on 0.5 met the 0.5 break on the way in, so that codemod is not run again — and because every codemod is idempotent, nothing would break if it were.

## `janux codemod`

Runs one codemod by id, including the framework migrations, which are never selected automatically.

```bash
janux codemod --list
janux codemod next/routes --dry-run
janux codemod next/routes
```

## The catalog

### Version codemods

Selected by `janux upgrade`. The id is the release that introduced the break.

| Id | What it does |
|---|---|
| `0.5.0/events-by-name` | `on={intents.x}` → `onClick={intents.x}`, and `<form intent={intents.x}>` → `<form onSubmit={intents.x}>` |

Only the attribute name changes. `data-input` still works and still wins over `.with()`, so folding one into the other would be a second, unasked-for change with a behavioural difference inside it. And only bindings rooted at `intents` are touched: `on` is an ordinary prop name, and a React `<Switch on={…}>` mounted through `foreign()` is not an event binding.

### Migration codemods

Run on request. See [Migrating from Next.js](/docs/more/migrating-from-next) and [Migrating from Astro](/docs/more/migrating-from-astro) for what each one leaves you to do by hand.

| Id | What it does |
|---|---|
| `next/routes` | Moves `app/**` and `pages/**` into `src/routes` and `src/api`, moves colocated files to `src/components`, and rebases every relative import the moves broke |
| `next/metadata` | `export const metadata` → `export const meta`, with the field shapes `PageMeta` uses; `generateMetadata` → `meta` |
| `next/imports` | Repoints the `next/*` imports Janux has an equivalent for, and removes and reports the ones it does not |
| `astro/routes` | Moves `src/pages` endpoints into `src/api`, and names the route file each `.astro` template becomes |
| `astro/content` | `astro:content` → `@janux/content`, and the Zod frontmatter schema → the Janux `schema()` |

## What a codemod reports

Anything a codemod cannot translate is printed against the file it found it in, prefixed `!`:

```txt
app/blog/[slug]/page.tsx → src/routes/blog/[slug]/index.tsx
  ! app/loading.tsx: `loading` has no file equivalent: a Janux boundary is `suspense:` on the `component()` that is waiting.
```

This is deliberate. A migration tool that quietly drops a page's keywords, or half-translates a Next `<Link>` into an `<a>` and loses its prefetching props with it, is worse than one that says it could not carry them — the first kind of failure is discovered in production.

## How they work

Codemods parse with [`@swc/core`](https://swc.rs) and edit the file by **span**: the byte ranges under the nodes that actually changed are spliced, and nothing else in the file is touched.

The alternative — parse, transform the tree, print it back — reformats a file the author never asked to reformat and drops the comments the parser did not attach, so a one-attribute rename arrives as a thousand-line diff nobody can review. Splicing is also what makes the second run a no-op: there is nothing left to normalize.

Spans are byte offsets, not character offsets, which matters the moment a file contains a `→` above the line being edited.

## Adding one

The pattern is set, and it is small. A codemod is an object with an `id`, a `title`, a `description`, an `appliesTo(file)` predicate and a `run({ code, file })` that answers what should change:

- `code` — the rewritten source, absent when the file is already right
- `moveTo` — where the file belongs, absent when it stays
- `notes` — what a human still has to do here

Every field is optional because the common answer is "nothing", which is what makes a second run a no-op rather than a second diff. A codemod for a breaking change carries `since: '<version>'` and is named `<version>/<name>`; one without it is a migration and is only run by name.

Register it in `packages/janux-cli/src/codemods/registry.ts` and add a before/after pair under `__fixtures__/<id>/`. The fixture suite discovers it from the registry: a codemod with no fixtures fails, and every pair it does have is checked for output, destination and idempotence.
