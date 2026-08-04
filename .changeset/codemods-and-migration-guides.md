---
"@janux/cli": minor
---

`janux upgrade` and `janux codemod`: the migration tooling the stability contract owes.

Janux is 0.x, so a minor is the breaking bump. `STABILITY.md` promises a stable export is deprecated before it goes; this is the other half — for the breaks that cannot be absorbed by a deprecation, the release now ships the thing that applies them.

`janux upgrade` runs the codemods for the breaking changes between the version an app is on and the one it is moving to. `--from` defaults to the `janux` the app actually resolves and `--to` to the version of the CLI being run, so after bumping the dependency the bare command is usually right. The range is half-open — a codemod runs when its release is after `--from` and at or before `--to`. One codemod exists so far, for the only break since 0.3: `0.5.0/events-by-name` turns `on={intents.x}` into `onClick={intents.x}` and `<form intent={intents.x}>` into `onSubmit`.

`janux codemod <id>` runs one by name, which is how the framework migrations are reached: `next/routes`, `next/metadata`, `next/imports`, `astro/routes` and `astro/content` translate the mechanical part of an app arriving from Next or Astro — file structure (including moving colocated files out of `src/routes`, which would otherwise become URLs, and rebasing every relative import the moves break), the metadata export, and the imports that have an equivalent. What has none is reported against the file it was found in rather than half-translated.

Two rules hold for every codemod, and the suite enforces both for each of them: `--dry-run` prints the unified diff it would write and writes nothing, and running one twice is the same as running it once. Codemods parse with `@swc/core` and splice the byte spans under the nodes that changed, so a one-attribute rename is a one-line diff and the rest of the file — formatting and comments included — is untouched.

Two migration guides ship with them, deliberately unflattering about how much is automatic: [Migrating from Next.js](https://janux.build/docs/more/migrating-from-next) and [Migrating from Astro](https://janux.build/docs/more/migrating-from-astro).
