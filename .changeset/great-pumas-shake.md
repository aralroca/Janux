---
'create-janux': patch
---

`create-janux --template <name>` scaffolds a whole product instead of a feature: `dashboard` (a copilot that drives the UI), `back-office` (CRUD with an approvals inbox and an audit trail) and `content-site` (`llms.txt` + `.md` projections + a typed search tool). Each brings its own README, a one-command deploy and `janux eval` scenarios. Run `--template` with no name to pick from the list.

A scaffolded app no longer inherits the monorepo's `tsconfig.json` `extends` — it is inlined, so `--example shop` and `--example i18n` now serve pages instead of answering every request with a 500.
