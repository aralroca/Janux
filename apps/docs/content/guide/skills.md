---
title: Skills
description: "Procedures the model loads on demand: markdown in src/skills, an index that always travels and a body that only arrives when asked for — projected to MCP, and checked by janux verify."
---

# Skills

A tool says what one call does. A **skill** says how several of them add up to a task: the order, the criteria, the worked example, the rule that is not obvious from any single description.

That is real knowledge, and it does not fit in a tool description. The obvious place to put it is the system prompt — and that is exactly what does not scale. Every page of procedure is paid for on every turn, by every caller, whether or not the task ever comes up. Ten procedures and the context window is spent before the user has said anything.

So a skill is split in two. Its **index entry** — name, what it is, when to reach for it — is one line, small enough to always be in context. Its **body** is fetched only once the model decides the task is this one.

## The convention

The filesystem is the declaration, exactly as it is for routes:

```
src/skills/
  process-return.md            → skill "process-return"
  reconcile-shelf/
    SKILL.md                   → skill "reconcile-shelf"
```

A flat `.md` file is a skill. A directory with a `SKILL.md` is a skill too — the form to reach for when the procedure will grow siblings later. Both are discovered at boot; nothing is registered anywhere.

```md title="src/skills/process-return.md"
---
description: Process a customer return end to end — policy lookup, refund approval and the restock that follows.
when: The customer wants to return something, asks for a refund, or an open return needs finishing.
tools:
  - api.returns.order
  - api.returns.policy
  - api.returns.refund
---

# Process a return

A refund is refused unless it carries the policy code for the reason on that
order. The code is issued per reason by `api.returns.policy` and cannot be
guessed. Everything below exists because of that one rule.

1. Read the order with `api.returns.order`. Note `sku` and `reason`.
2. Ask `api.returns.policy` for that exact reason. Carry the `code` forward.
3. `api.returns.refund` with `{ orderId, policyCode }`. This tool is
   `confirm`-guarded: your call returns a proposal a human approves. Wait.
```

| Field | |
|---|---|
| `description` | **Required.** What the procedure is. This is the index line the model routes on. |
| `when` | Optional. When to reach for it, in the user's terms. |
| `name` | Optional. Defaults to the file or directory name. |
| `tools` | Optional. The tools the procedure uses — [`janux verify`](#verification) checks every one of them exists. |

Frontmatter is validated by the same `schema()` that types component state and [content collections](/docs/guide/content-collections). A skill with no description stops the boot rather than shipping an index line nobody can route on.

## Loading on demand

The index rides in every manifest, so the model always knows what exists:

```json title="GET /_janux/manifest?path=/"
{
  "tools": [...],
  "skills": [
    {
      "name": "process-return",
      "description": "Process a customer return end to end — …",
      "when": "The customer wants to return something, …",
      "tools": ["api.returns.order", "api.returns.policy", "api.returns.refund"]
    }
  ]
}
```

The built-in copilot turns that into one prompt section and one extra tool, `load_skill`. When the model calls it, the server answers with that skill's markdown as an ordinary tool result, in the same turn. Nothing else changes: no other body is loaded, and the next turn does not carry procedures it did not use.

Two properties are worth being explicit about.

**A skill is documentation, not a channel.** `load_skill` returns text and invokes nothing. The tools a procedure names are still called through the [invocation pipeline](/docs/guide/intents-and-guards), with the guards they declare. A `confirm`-guarded refund is still a proposal a human approves, no matter how confidently the skill describes it. A skill cannot grant itself a permission by writing one down.

**The index is not the body.** Nothing that only belongs in the procedure should be in the `description` or `when` — those travel on every turn.

One boundary is worth stating plainly. Tools are filtered per caller: a `forbidden` guard removes a tool from the manifest and from `tools/list`, so its name and schema are never handed to an agent that may not call it. **Skills are not filtered that way** — they are authored content, listed for everyone who can reach the surface, exactly like the copy on a page. Guards still hold on every call the procedure describes, so nothing becomes *executable*; but a skill that spells out an admin-only tool has told the reader it exists. Put access-sensitive procedures behind [`mcpAuth`](/docs/guide/agent-and-copilot), and keep what a caller may not be told out of `src/skills/`.

## MCP and external clients

Skills are projected onto the hosted [MCP endpoint](/docs/guide/agent-and-copilot#webmcp-zero-config) as resources, where the protocol already has the right shape for this: the resource **list** is the index, and `resources/read` is the body.

```bash
curl -s localhost:3000/_janux/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
# → { "uri": "janux://skill/process-return", "description": "… Use when: …", "mimeType": "text/markdown" }

curl -s localhost:3000/_janux/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"janux://skill/process-return"}}'
# → the markdown
```

Claude Desktop, an internal agent or anything else that speaks MCP gets the same on-demand contract the app's own copilot does, without a second implementation.

## Verification

This is the part other frameworks structurally cannot do.

A skill is prose written for a model. Anywhere else, it can name a tool that does not exist and nothing finds out until a live agent tries it. In Janux the tool list is *derived* from the mounted component tree — that is the [first design invariant](/docs/guide/architecture-and-roadmap#design-invariants) — so the same manifest that makes drift impossible for tools makes a lying skill detectable:

```bash
$ bunx janux verify
  ERROR api.returns.reimburse — skill "lies" (src/skills/lies.md) references a tool this app does not have
  ERROR returns-desk.escalate — skill "lies" (src/skills/lies.md) references a tool this app does not have

janux verify: 2 error(s), 0 warning(s).
```

Both halves are checked: the `tools:` a skill declares, and the names it writes down in its prose and in its worked example — which is where a model actually copies them from. A dotted token counts as a tool reference when its first segment is a namespace the app really has, so `janux.config.ts` and `import.meta.url` stay prose while `returns-desk.escalate` is held to the same standard as a declared tool. `ui_*` names are checked against the closed set of client tools.

A green run says so:

```
janux verify: agent surface OK — every reachable tool has a description, and 2 skill(s) name only tools that exist.
```

## A complete example

[`examples/with-skills`](https://github.com/aralroca/Janux/tree/main/examples/with-skills) is a returns desk built around the rule above, with two skills (both filesystem forms), evals that replay the procedure over the real agent surface with no model anywhere, and a deliberately broken skill the e2e suite drops in to prove `janux verify` really does go red.
