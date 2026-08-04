---
'@janux/cli': minor
'@janux/server': minor
'janux': minor
---

`janux run <tool> --arg value` invokes an `intent()` or an `api()` from the terminal — the last face of "one definition, N projections", and a derived one: the tools are the ones the manifest already advertises, the flags are the ones their input schema already describes, and `--help` is generated from it. Nothing is declared for the CLI. `janux run` with no tool lists everything the app projects, with its guard.

Guards hold, because it is the same pipeline: calls go out as `origin: 'agent'` (a terminal is not a session), so `forbidden` is neither listed nor callable and `confirm` parks the call — prompting on a terminal, and **failing with exit 1** when there is nobody at one, rather than auto-approving. There is no `--yes` flag. Results are JSON on stdout, prose on stderr, so `janux run api.orders.reconcile --since 2026-01-01 | jq` is a CI step and not a hand-written HTTP client.

Two seams made it possible, both useful on their own: `createJanuxServer(...)` now returns `instancesFor(path, ctx, hooks?)` — the live islands and stores a render mounts, which is what `manifestFor` describes serialized — and a parked proposal no longer computes its shadow diff for a host that shows none (`proposalDiff: false`), so an intent's body is not run speculatively before a human approves it.
