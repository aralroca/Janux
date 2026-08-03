# Security Policy

## Supported versions

Janux is pre-1.0: only the latest published minor receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security reports.

Email **contact@aralroca.com** with:

- A description of the vulnerability and its impact
- A minimal reproduction (a failing test or curl sequence is ideal)
- Any suggested fix, if you have one

You will get an acknowledgement within a few days. Coordinated disclosure is appreciated — we will credit reporters in the release notes unless you prefer otherwise.

## Scope notes for Janux apps

Areas of particular interest for reports:

- **Guard bypasses** — any way for an agent-origin call to execute a `confirm`/`forbidden` intent or api without a human approval.
- **Proposal token bypasses** — settling an approved proposal outside its guarantees: replay (a token is single-use), past its TTL, from a session other than the proposing one, or with a payload other than the proposed one. These are tested guarantees, not open questions — the attacker corpus lives in `packages/conformance/security/proposal-tokens.cases.ts` and `packages/janux-server/src/proposals.test.ts`, and the threat model in the [intents and guards guide](apps/docs/content/guide/intents-and-guards.md). A reproducible break of any of them is a high-severity report.
- **Client bundle leaks** — server code from `*.api.ts` reaching the browser bundle through the SWC stub transform.
- **XSS** — escaping gaps in the SSR renderer or `dangerHTML` misuse the framework could prevent.
- **Manifest scoping** — tools/resources visible to a context that should not see them.
