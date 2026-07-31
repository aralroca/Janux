---
title: The Agentic Web
description: "The web has a second audience: AI agents now read, plan and act on the same pages people click. Janux is built for the web both can operate."
---

# The Agentic Web

The web has a second audience. People still click, but AI agents now read, plan and act on the same pages — from MCP clients like Claude or Cursor, from agentic browsers, and from the copilot inside your own product. **The Agentic Web is the web both audiences can operate.**

Janux is a framework built for that web from the first line: every component you write is a human interface *and* an agent interface, generated from one definition.

## What changed

For thirty years the web assumed one kind of user. Every contract we built — HTML, forms, sessions, CSS — describes what a person sees and clicks. An agent given the same page has to infer intent from markup: scrape the DOM, guess which button commits a payment, hope the selector survives the next deploy.

The industry's answer has been to bolt on a second interface. You already have an app that validates input, checks permissions and encodes the business rules; next to it you hand-write a set of tools that re-declares a fraction of that, in a different file, in a different vocabulary. It works on day one. Then the UI ships a new field, the tool doesn't, and your agent is confidently operating on a contract that no longer exists.

Three things break in that arrangement:

- **Drift.** The agent surface is a copy, and copies rot. Nothing fails when they diverge — it just gets quietly wrong.
- **Authority.** The tools are code, so "may an agent refund this order?" is answered by whoever wrote the integration, not by a policy you can read.
- **Testability.** Nobody can say what an agent is allowed to do today, so nobody can gate it in CI.

## The protocol stack

The good news is that the Agentic Web is standardizing in the open, and the layers are now distinct enough to name. Janux implements them so you don't have to.

| Layer | Standard | What Janux does |
|---|---|---|
| Tools over HTTP | **MCP** (Model Context Protocol) | A real, stateless MCP server at `/_janux/mcp`, generated from your `api()` functions. Dual-era: negotiates `2026-07-28` and `2025-06-18`. |
| Tools in the browser | **WebMCP** (`document.modelContext`) | Every mounted intent registers itself the moment its island mounts, so browser agents and the DevTools panel see it. Polyfilled where the API is missing. |
| Discovery | **`llms.txt`** + Markdown projections | An opt-in index at `/llms.txt` (dynamic routes expanded via `staticParams`), and any page readable as Markdown by appending `.md`. |
| Identity | **Web Bot Auth** (RFC 9421) | Signed agent requests verified per call, under an `observe` or `require` policy. |
| Authority | *(no standard yet)* | `guard: 'auto' \| 'confirm' \| 'forbidden'` per intent and per api, enforced by origin — and surfaced to MCP clients as `annotations.requiresApproval`. |

You opt into none of this by hand. Write a component, and the tools, the resource, the manifest and the MCP endpoint come with it.

## What an agent sees

Take a component with two intents — one safe, one that moves money. Its projection onto the agent surface is generated:

```json
{
  "resources": ["ui://cart"],
  "tools": [
    {
      "name": "cart.addItem",
      "description": "Add a product to the cart",
      "guard": "auto"
    },
    {
      "name": "cart.checkout",
      "description": "Pay for the cart",
      "guard": "confirm"
    }
  ]
}
```

That contract is not a file somebody maintains. It is read out of the component that rendered the page, which is why it cannot describe a tool the UI no longer has.

An external client connects with a URL — no SDK, no adapter:

```bash
claude mcp add --transport http my-app https://your.app/_janux/mcp
```

And inside the browser, the same tools are on the page itself, so an agentic browser drives your app through the actions you designed rather than through synthetic clicks. `boot()` does this for every island as it mounts — you write no registration code:

```
document.modelContext.registerTool({ name: 'cart_addItem', ... })
```

## Authority is the hard part

Discovery is the easy layer. The question that decides whether you can *ship* an agent surface is: what happens when the agent asks for something consequential?

In Janux that question has a declared answer, per action:

- **`auto`** — agents call it directly. Reads, searches, navigation.
- **`confirm`** — a human click executes it immediately; an *agent* call parks as a **Proposal** that a person approves or rejects on the real UI, and runs exactly once.
- **`forbidden`** — never exposed as a tool at all. The agent falls back to the DOM, with exactly the permissions a user has.

Every invocation carries its **origin** (`human` or `agent`) into the audit trail, so "who did this" is a property of the record, not an inference. And because the guards are part of the definition, they are testable: `janux verify` fails the build when an agent-reachable tool ships without a description, and `janux eval` replays scripted agent tasks — approval steps included — against a running app.

See [Intents and guards](/docs/guide/intents-and-guards) for the full model, and [`examples/human-in-the-loop`](https://github.com/aralroca/Janux/tree/main/examples/human-in-the-loop) for it wired end to end.

## Why a framework, not a library

You could add each layer above to an existing app: an MCP server here, a WebMCP registration there, an approvals table, an audit log. Teams do. What you can't retrofit is the *single source of truth* — as long as the view and the tools are two artifacts, keeping them in sync is a permanent tax that grows with the app.

A framework can collapse them, because it owns the definition. That is the whole bet of Janux: one component, projected as a view for humans and as typed tools and resources for agents, running the same guard-checked pipeline whichever side calls it.

Next: [What is Janux?](/docs/getting-started/what-is-janux) for the shape of the primitive, or [Quick start](/docs/getting-started/quick-start) to have it running in about a minute.
