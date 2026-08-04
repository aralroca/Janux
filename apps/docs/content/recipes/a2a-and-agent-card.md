---
title: A2A and the agent card
description: Every Janux app publishes a derived /.well-known/agent-card.json and speaks A2A at /_janux/a2a — the same tools, the same guards, one more protocol.
---

# A2A and the agent card

MCP is how a *model* uses your app. [A2A](https://a2a-protocol.org/) is how another *agent* does — a peer with its own goals, its own users and its own model, that needs to discover what you can do before it asks you to do it.

Janux serves both from the same `api()` functions. There is nothing to write:

| URL | What it is |
|---|---|
| `/.well-known/agent-card.json` | The A2A **Agent Card** (spec §4.4.1), derived from the app |
| `/_janux/a2a` | The A2A endpoint, JSON-RPC binding (`SendMessage`, `GetTask`) |

## The card is derived, never written

A hand-written agent card is a second copy of your agent surface, and a second copy drifts: rename a tool, close a guard, and the file on disk keeps telling every agent that reads it the old story. So the card is a pure function of what the app already declares.

```ts
// src/server/supplier.api.ts
export const quote = api({
  description: 'Price a hypothetical order. Reserves nothing and ships nothing.',
  input: schema({ sku: str().min(3).max(3), units: int().min(1).max(500) }),
  run: ({ input }) => priceFor(input.sku, input.units),
});

export const ship = api({
  description: 'Ship units of a sku from stock. Runs only after a human here approves.',
  input: schema({ sku: str().min(3).max(3), units: int().min(1).max(500) }),
  guard: 'confirm',
  run: ({ input }) => sendShipment(input.sku, input.units),
});
```

That is the whole configuration. The card writes itself:

```jsonc
{
  "name": "Parts Supplier",                     // title
  "description": "Quotes and ships parts…",     // llmsTxt.description
  "version": "1",
  "supportedInterfaces": [
    { "url": "https://supplier.example/_janux/a2a", "protocolBinding": "JSONRPC", "protocolVersion": "1.0" }
  ],
  "capabilities": {
    "streaming": false, "pushNotifications": false, "extendedAgentCard": false,
    "extensions": [{
      "uri": "https://janux.build/a2a/tool-invocation/v1",
      "required": true,
      "description": "Send one message whose single DataPart is {\"skill\": <skill id>, \"input\": <object>}…",
      "params": { "schemas": { "supplier.quote": { "type": "object", "properties": {…} } } }
    }]
  },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    { "id": "supplier.quote", "name": "supplier.quote", "description": "Price a hypothetical order…", "tags": ["tool", "auto"] },
    { "id": "supplier.ship",  "name": "supplier.ship",  "description": "Ship units of a sku…",       "tags": ["tool", "confirm"] },
    { "id": "skill:refund",   "name": "refund",         "description": "How a refund is issued…",     "tags": ["procedure"] }
  ]
}
```

Three things to notice:

- **The guard is a tag.** A skill tagged `confirm` tells the caller *before it calls* that a human will have to approve. A tool the guard forbids for this caller is not on the card at all — the same filter `tools/list` and the page manifest use, so what an agent may not call it is never told exists.
- **Input schemas travel in a declared extension.** `AgentSkill` has no schema field, because an A2A skill is normally addressed in prose. A Janux skill is a typed call, so the schemas go in the one slot the spec reserves for this (§4.6) and the extension's own description says how to spend them.
- **Your [skills](/docs/guide/skills) are on it too**, as `skill:<name>` procedures. Invoking one returns its markdown body — the same on-demand contract MCP gets from `resources/read`, in the protocol an A2A client already speaks.

## Calling it

```bash
curl -s https://supplier.example/_janux/a2a \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{
        "role":"ROLE_USER","messageId":"m1",
        "parts":[{"data":{"skill":"supplier.quote","input":{"sku":"MUG","units":12}}}]}}}'
```

```jsonc
{ "jsonrpc": "2.0", "id": 1, "result": { "task": {
  "id": "…", "contextId": "…",
  "status": { "state": "TASK_STATE_COMPLETED", "timestamp": "…" },
  "artifacts": [{ "artifactId": "…", "name": "supplier.quote", "parts": [{ "data": { "total": 108 } }] }]
}}}
```

`GET /_janux/a2a` answers with the card rather than a bare `405`, so the endpoint documents itself to anyone who opens it.

## `guard: 'confirm'` is `TASK_STATE_INPUT_REQUIRED`

The interesting case is the one A2A already has a state for. A `confirm`-guarded skill does not run — it parks:

```jsonc
{ "task": {
  "id": "6f1e…",                                // the task's own id — poll GetTask with it
  "status": {
    "state": "TASK_STATE_INPUT_REQUIRED",
    "message": { "role": "ROLE_AGENT", "parts": [
      { "text": "\"supplier.ship\" is guarded by guard: 'confirm' — nothing ran…" },
      { "data": { "tool": "supplier.ship", "input": {…}, "proposal": "prop_api_2f3c….<sig>", "approve": "/_janux/approve" } }
    ]}
  }
}}
```

The task id and the proposal token are deliberately different strings: the bare proposal id travels in spans and audit entries because on its own it grants nothing, and naming the task after it would have made it grant one thing — a read of whatever the approved call returned.

A human on **your** site settles it (`POST /_janux/approve`, or a click on a page that calls `janux.approve(token)` — the bridge forwards a token this page never mirrored, which is exactly the case an agent parked from somewhere else creates), and the caller learns the outcome by polling:

```bash
curl -s https://supplier.example/_janux/a2a -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"6f1e…"}}'
# → TASK_STATE_COMPLETED with the artifact, or TASK_STATE_CANCELED if the human said no
```

Everything else answers in one round trip and is terminal on arrival, so the endpoint keeps no session and no history: the only state it holds is the proposal that a human still owes an answer to.

## One pipeline, not three

A2A is a protocol, never a second way in. Discovery goes through the same guard resolution as the MCP listing and the page manifest; invocation goes through the same `api()` pipeline as a click, a bridge call and a `tools/call` — same validation, same guards, same proposals, same audit entries.

That is asserted, not asserted-to: the conformance corpus asks the same question three ways — bridge, MCP, A2A — and expects one answer written out three times.

```
parity-the-three-doors-refuse-a-forbidden-tool-in-the-same-words
  error Tool "shop.nuke" is not available | error Tool "shop.nuke" is not available | error Tool "shop.nuke" is not available
```

Practical consequences worth knowing:

- **Auth is shared.** [`mcpAuth`](/docs/recipes/external-mcp-clients) protects `/_janux/a2a` as well — a separate door with a weaker lock would make the lock decorative. Unauthenticated `POST`s get `401` + `WWW-Authenticate: Bearer realm="janux-a2a"`, and the card declares the scheme while staying public, because discovery is what a card is for.
- **`ctx` still decides.** A guard reading `ctx.scopes` filters the card exactly as it filters `tools/list`.
- **The audit trail does not care which door you used.** Entries carry `origin: 'agent'` either way.

## `janux verify` covers it

```bash
bunx janux verify
# janux verify: agent surface OK — every reachable tool has a description,
# and the agent card advertises 3 skill(s) the app really has.
```

Two A2A-specific errors join the existing checks:

- The card advertises a **tool the app does not have**. Impossible while the card is derived, which is the point: it fires the day somebody starts maintaining one by hand.
- A tool is advertised **without a description**. An outside agent has no page to fall back on, so a tool it is offered with no description is a tool it can only guess at.

One thing `verify` deliberately does not warn about: an app with no `siteUrl`. The card then advertises whatever origin each request arrived on, which is right everywhere except behind an origin-rewriting proxy — a warning that fires on every app in dev is a warning nobody reads. Set `siteUrl` when you deploy behind one.

## Try it

Two apps, two origins, a `confirm` guard in the middle: [`a2a-supplier`](https://github.com/aralroca/Janux/tree/main/examples/a2a-supplier) publishes the card and parks the shipment; [`a2a-buyer`](https://github.com/aralroca/Janux/tree/main/examples/a2a-buyer) discovers it, hires it, and watches the task until a human at the supplier decides.

---

Related: [External MCP clients](/docs/recipes/external-mcp-clients) · [Intents and guards](/docs/guide/intents-and-guards) · [Skills](/docs/guide/skills) · [Auth and context](/docs/recipes/auth-and-context)
