# create-janux

## 0.7.0

### Patch Changes

- `create-janux --template <name>` scaffolds a whole product instead of a feature: `dashboard` (a copilot that drives the UI), `back-office` (CRUD with an approvals inbox and an audit trail) and `content-site` (`llms.txt` + `.md` projections + a typed search tool). Each brings its own README, a one-command deploy and `janux eval` scenarios. Run `--template` with no name to pick from the list.

  A scaffolded app no longer inherits the monorepo's `tsconfig.json` `extends` — it is inlined, so `--example shop` and `--example i18n` now serve pages instead of answering every request with a 500.

## 0.6.0

### Patch Changes

- The published packages ship compiled ESM with declarations and sourcemaps, instead of manifests pointing at
  TypeScript source. Node refuses to strip types under `node_modules`, so every earlier release was unloadable from a
  plain Node project; a Node install smoke test now runs on every change so it cannot regress.

## 0.5.0

### Minor Changes

- The scaffolded app uses `on*` handlers and `.with()`, matching the 0.5.0 event syntax.

## 0.4.0

Released with the framework; no changes of its own.
