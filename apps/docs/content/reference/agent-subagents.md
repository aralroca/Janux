---
title: Agent subagents & handoffs
description: "Compose agents on one app: delegate a focused task to a budgeted subagent, or transfer the conversation to a specialist that answers from then on. Guide: The agent and your copilot."
---

# Agent subagents & handoffs

Two ways one `defineAgent` config composes more agents. A **subagent** is a worker: the model hands it a focused task, it runs server-side with its own prompt and tools under a mandatory budget, and reports back — the parent keeps the conversation. A **handoff** is a transfer: a specialist takes the conversation over and answers the user from then on. Guide: [The agent and your copilot](/docs/guide/agent-and-copilot).

```ts
import { defineAgent } from '@janux/agent';

export default defineAgent({
  instructions: 'You are the front desk. Delegate lookups; hand money questions to billing.',
  tools: { exclude: ['api.admin.*'] },
  subagents: {
    research: {
      description: 'Looks facts up in the knowledge base.',
      instructions: 'Answer strictly from api.support.search results.',
      tools: { include: ['api.support.*'] },
      budget: { maxTurns: 4, maxTokens: 30_000, maxMs: 30_000 },
    },
  },
  handoffs: {
    billing: {
      description: 'Handles refunds and invoices.',
      instructions: 'You are the billing specialist.',
      tools: { include: ['api.billing.*'] },
    },
  },
});
```

## Subagents

Each entry becomes one `delegate.<name>` tool on the parent's list. Its input is a single `task` string — the subagent starts with **fresh history**, so the task must carry all the context it needs; it cannot see the conversation. The tool result is the subagent's report: `{ text }` when it answered, `{ stopReason }` when a budget line cut it, `{ error }` when it was refused before running.

| `SubagentConfig` field | Meaning |
|---|---|
| `description` | What the parent's model reads to decide when to delegate. |
| `instructions` | The subagent's own system prompt — it never inherits the parent's. |
| `model`, `modelOptions` | Optional model override; defaults to the parent's resolved model. Unresolvable → `{ error: 'subagent_model_unavailable' }`. |
| `cost` | Prices the subagent's rounds. Without it they are unpriced tokens — never billed at the parent's rates. |
| `tools` | Narrows the surface further. The effective surface is the **intersection** with the parent's filter. |
| `budget` | **Mandatory.** `defineAgent` throws without `maxTurns >= 1`. |

### The budget

An unbounded delegation loop is an open tab on someone's bill, so every subagent declares one:

| Line | Cut reported as |
|---|---|
| `maxTurns` (required) | `{ stopReason: 'max_turns' }` |
| `maxTokens` — input + output across its rounds | `{ stopReason: 'max_tokens' }` |
| `maxMs` — wall clock for the whole delegation | `{ stopReason: 'max_time' }` |

### Not an escalation path

A subagent's tool surface is server-executable only — `api.*` intents and remote MCP tools; UI tools, skills and delegation itself stay off it (depth one, so a chain cannot outrun its budget). Every tool must pass the parent's filter **and** the subagent's own: a delegate with `include: ['api.*']` under a parent that excludes `api.admin.*` still cannot reach `api.admin.*` — not advertised, and refused with `tool_forbidden` if its model calls it anyway. Guards keep enforcing at the invocation pipeline, the caller's [guardrail processors](/docs/reference/agent-guardrails) run on the delegated task before any model call, and each delegation spends one slot of the caller's [rate limit](/docs/reference/agent-rate-limit) (`{ error: 'rate_limited' }` when exhausted).

### Traces and the bill

A delegation nests an `invoke_agent <name>` span (with `gen_ai.agent.name`) under the parent's `invoke_agent janux` turn span, its rounds as `chat` spans inside — per the [observability conventions](/docs/reference/observability-api). Each `invoke_agent` span totals only its own loop under `janux.turn.*`, so summing over a trace never counts a round twice. The turn envelope's `usage` is the caller's whole bill: parent rounds plus every delegation, each priced by its own `cost`.

## Handoffs

Each entry becomes one `handoff.<name>` tool with an optional `reason` input. When the model calls it, the conversation transfers:

- **kept** — the dialogue: user and assistant text;
- **dropped** — the noise: tool results, assistant tool-call scaffolding, `[ui tool results]` continuation messages;
- **swapped** — system prompt (the target's `instructions` plus a transfer note carrying the `reason`), tool surface (the target's `tools` filter; client `ui_*` tools stay, composition tools do not — a target neither chains handoffs nor delegates), and model when the target declares one (unresolvable → `handoff_model_unavailable`, HTTP 502).

The target answers the user from then on. Every envelope after the transfer carries `agent: "<name>"`, and the client echoes it back like `threadId` — a later turn with `{ agent: "billing" }` starts as billing (unknown names are a 400 `unknown_agent`). The turn span records the transfer as `janux.handoff.to` and `gen_ai.agent.name`; rounds after it are priced by the target's `cost` (or the parent's, when the target runs on the parent's model).

`HandoffConfig` is `SubagentConfig` minus the budget — a handoff target answers under the turn's own `maxTurns` — with the same `description` / `instructions` / `model` / `cost` / `tools` fields, where `tools` is the target's **own** surface rather than an intersection: a specialist sees its specialty, which may include tools the front desk hides.

Working example: [`examples/with-subagents`](https://github.com/aralroca/Janux/tree/main/examples/with-subagents).
