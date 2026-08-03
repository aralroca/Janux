---
title: Templates
description: Production-shaped starting points for a whole product — a copilot-driven dashboard, a back office with approvals and an audit trail, and a content site agents read natively. Each ships a README, one-command deploy and agent evals.
---

# Templates

An [example](/docs/more/examples) teaches one feature. A **template starts a product**: a
complete app with its own README, a one-command deploy, and — the part nobody can copy
quickly — [agent evals](/docs/recipes/agent-evals-in-ci) that prove its agent surface works.

```bash
bun create janux my-app --template dashboard
cd my-app && bun install && bun run dev   # http://localhost:4321
```

Run it without a name and the gallery lists itself, one line each:

```bash
bun create janux my-app --template
```

Every template boots with **no API key at all**. The one with a copilot degrades on
purpose: without `JANUX_MODEL` the app still runs, every button works, and the copilot
answers with a setup card next to a chip that replays the same task through real tool
calls and no model.

## The gallery

### `dashboard` — a copilot that really drives the UI

<img
  src="/templates/dashboard.jpg"
  alt="An ops dashboard: incident table with KPIs on the left, copilot on the right having acknowledged and resolved an incident, with maintenance mode waiting for approval"
  width="1400"
  height="720"
  loading="lazy"
  decoding="async">

Incident triage where the copilot is an operator, not a chat widget. It reads the board
through `api.ops.board`, acknowledges and resolves with the **same tools the buttons
call**, and when it reaches for the customer-visible switch — maintenance mode — the
[`confirm` guard](/docs/guide/intents-and-guards) turns its call into a proposal only a
human approves.

| Tool | Guard |
|---|---|
| `api.ops.board`, `api.ops.acknowledge`, `api.ops.resolve` | auto |
| `api.ops.maintenance` | **confirm** |

Its evals replay triage, the whole propose → approve → consumed-proposal flow, and the
validation walls — no model, no key.

```bash
bun create janux my-ops --template dashboard
```

### `back-office` — CRUD with a human in the loop and one audit trail

<img
  src="/templates/back-office.jpg"
  alt="A customers back office: roster with plans on the left, an agent-origin delete parked in the approvals inbox, and the live agent surface listing every tool with its guard on the right"
  width="1400"
  height="1556"
  loading="lazy"
  decoding="async">

A customers desk where **who is asking changes what happens**. Adding a customer or
changing a plan executes for humans and agents alike; deleting one is `confirm`-guarded,
so an agent's call parks in the approvals inbox until a human decides. Every executed
change lands in one audit trail that records the actor from the invocation
[`origin`](/docs/guide/intents-and-guards) — not from a form field.

| Tool | Guard |
|---|---|
| `api.customers.list`, `.create`, `.update`, `.trail` | auto |
| `api.customers.remove` | **confirm** |

Its evals cover the CRUD loop, the full approval flow *including what the trail says
afterwards*, and the rejected paths.

```bash
bun create janux my-desk --template back-office
```

### `content-site` — a site agents read natively

<img
  src="/templates/content-site.jpg"
  alt="A markdown content site: search results for a query above the post list, and a footer listing llms.txt, the .md projections and the manifest"
  width="1400"
  height="1368"
  loading="lazy"
  decoding="async">

Markdown files with a typed frontmatter contract, served with two faces. People get
pages; agents get [`llms.txt`](/docs/reference/server-api), every page as a clean `.md`
projection, and a typed `api.site.search` tool that is **the same code** as the search
box in the header. Mark a post `draft: true` and it leaves the index, the search and
`llms.txt` at once.

| Surface | What an agent gets |
|---|---|
| `GET /llms.txt` | Every published page and every tool |
| `GET /posts/<slug>.md` | Any page back as markdown — no scraping |
| `api.site.search` | Typed search; drafts never returned |
| `api.site.subscribe` | Subscribe an email; duplicates refused loudly |

Its evals prove the search hits, that the draft never leaks, and the validation walls.

```bash
bun create janux my-notes --template content-site
```

## What every template guarantees

- **Runs on a clean machine.** Scaffolded outside this repository, `bun install && bun run dev`
  serves the app — checked in CI, not by hand.
- **No API key to start.** Nothing mandatory; the copilot degrades with a setup card and a
  no-model demo.
- **Its own README**, with the agent surface, the evals and the deploy line.
- **Deployable in one command**: `bun run build && bun run start`, or Vercel after a
  one-time `bunx janux-vercel` — see [deploying](/docs/recipes/deploying).
- **Green evals**: `bun run eval` runs [`janux eval`](/docs/recipes/agent-evals-in-ci)
  over scripted agent tasks and turns them into an exit code. That is the file to copy
  into your own CI.

> **Tip**: want a feature rather than a product? The [examples](/docs/more/examples) are
> 26 focused apps, scaffoldable the same way with `--example <name>`.
