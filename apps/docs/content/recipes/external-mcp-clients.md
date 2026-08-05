---
title: Driving a Janux app from an external MCP client
description: Every Janux app is an MCP-style surface over HTTP. Your copilot uses it — but so can Claude Code, a CI script, or any agent you run elsewhere.
---

# Driving a Janux app from an external MCP client

Every Janux app is an MCP-style surface over HTTP. Your copilot uses it — but so can Claude Code, a CI script, or any agent you run elsewhere.

## The hosted MCP endpoint (by URL)

Every app auto-serves a **real MCP server** at `/_janux/mcp` — streamable HTTP, stateless (a fresh logical server per request, safe behind a load balancer), generated from the app so it cannot drift:

```bash
# Add it to any MCP client by URL:
claude mcp add --transport http my-app https://your.app/_janux/mcp
```

- **tools** — every `api()` function, with its JSON schema; `confirm`-guarded tools carry `annotations.requiresApproval`.
- **resources** — every page, readable as clean **Markdown** (`janux://page/<path>`). The same projection is served over plain HTTP with the `.md` suffix (`GET /pricing.md`) — the whole site is agent-readable content, zero hand-written MCP code.
- **auth** — for a shared bearer, one line in `janux.config.ts` is enough: `mcpAuth: { tokenEnv: 'AGENT_TOKEN' }` (or a literal `token`; `tokenEnv` wins, read at boot). Custom verification stays available as `mcpAuth: { verify(token, req) }` in the server options. Either way unauthenticated `POST`s get `401` + `WWW-Authenticate` (Bearer, with optional resource-metadata URL), the browser landing stays public — its connect commands switch to `--header "Authorization: Bearer $TOKEN"` placeholders — and the verified identity lands in `ctx.mcpIdentity` for tenant scoping. Without it the endpoint is open (dev, public corpora).

## Discovery

Start site-wide (opt-in via the `llmsTxt` server option): `GET /llms.txt` is a markdown index of every page — dynamic routes list their real URLs via `staticParams`, not `[id]` patterns — and every server tool, with approval-gated tools annotated. From there, drill into a route for full schemas:

```bash
curl -s 'https://your.app/llms.txt'                          # pages + tools overview
curl -s 'https://your.app/_janux/manifest?path=/shop' | jq   # full schemas for one route
```

```jsonc
{
  "resources": [{ "uri": "ui://cart", "schema": {...}, "readers": [...] }],
  "tools": [
    { "name": "cart.addItem", "guard": "auto", "input": {...}, "ready": true },
    { "name": "api.shop.pay", "guard": "confirm", "input": {...} }
  ],
  "events": ["cart.checkedOut"]
}
```

The manifest is **per route and per context**: tools an unauthorized context may not call simply aren't listed.

To identify your client to the app (rate limits, per-agent policies, audit), sign requests with Web Bot Auth — the server verifies them into `ctx.agent` via `agents.webBotAuth`. See the [Server API](/docs/reference/server-api).

## Calling server tools

```bash
curl -s -X POST https://your.app/_janux/api/shop.searchOrders \
  -H 'content-type: application/json' \
  -H 'x-janux-origin: agent' \
  -d '{"status":"paid"}'
# → { "ok": true, "result": [...] }
```

Always send `x-janux-origin: agent` from automation — it's what makes guards behave: `forbidden` tools 403, `confirm` tools return a proposal instead of executing:

```bash
# 1. Propose
curl -s -X POST .../\_janux/api/shop.pay -H 'x-janux-origin: agent' -d '{"total":2500}'
# → { "ok": true, "result": { "status": "proposal", "id": "prop_api_7" } }

# 2. A human approves (your UI, a Slack button, an ops console…)
curl -s -X POST .../_janux/approve -d '{"id":"prop_api_7"}'
# → executes exactly once; replaying the id 404s
```

## Asking a human: elicitation

A `confirm`-guarded tool has always parked a proposal for a human. Since **2026-07-28** the protocol has a word for that, and the endpoint speaks it.

The spec's mechanism is [multi round-trip](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr): the server answers `input_required` instead of a result, and the client retries the same call once it has what was asked for. Nothing is pushed at the client, so a stateless server can do it:

```jsonc
// 1. tools/call shop.pay → nothing runs
{ "resultType": "input_required",
  "inputRequests": {
    "approval": { "method": "elicitation/create",
      "params": { "mode": "url", "message": "…needs a human first…",
                  "url": "https://your.app/_janux/elicit?token=prop_api_…" } } },
  "requestState": "prop_api_….<signature>" }

// 2. A human opens that URL and approves. The call runs, once, with origin: 'human'.

// 3. The client retries the same tools/call with requestState + inputResponses
{ "resultType": "complete", "content": [{ "type": "text", "text": "…" }] }
```

Three things are worth knowing about how this is wired:

- **`url` mode, never `form`.** Form mode would have the MCP client collect the approval, which is the one decision that must not happen there. The URL points at a page on your own origin that shows the tool and the exact input, and the approval lands in the audit trail as `origin: 'human'` — the same entry the in-page flow writes, because it is the same code path.
- **`requestState` is the proposal token.** It is HMAC-signed over the proposal id, the payload hash and the session, so a client that edits it gets a refusal rather than someone else's proposal. That is what lets the retry be authenticated without the server remembering the connection.
- **A client that does not declare `elicitation.url` is not elicited from.** It gets the answer it always got — the `status: "proposal"` payload above — so nothing that works today stops working.

The retry is honest about all three outcomes: still waiting (another `input_required`), approved (the result), rejected or expired (an `isError` result). A client that reports `action: "decline"` drops the proposal immediately.

## Being told when something changed: subscriptions

`subscriptions/listen` (which replaced `resources/subscribe` and the GET stream) opens an SSE stream for the life of that one POST — again, no session, no affinity:

```jsonc
{ "method": "subscriptions/listen",
  "params": { "notifications": { "resourceSubscriptions": ["janux://page/orders"] } } }
```

The server acknowledges first with the subset it agreed to honor, then sends `notifications/resources/updated` when a watched page's cached response is invalidated — `revalidatePath('/orders')` is exactly the event "the projection of that page changed". Closing the stream releases the watch.

Be aware of what this does **not** watch: island state lives in a browser, not on the server, so a stateless endpoint cannot notify you that a user's island changed. Tag invalidations (`revalidateTag`) name no single resource and notify nothing.

## Spec coverage, honestly

What `/_janux/mcp` implements of [the 2026-07-28 spec](https://modelcontextprotocol.io/specification/), and what it does not. The endpoint is dual-era: a client asking for an older version keeps the `initialize` handshake and the behaviour it had.

| Feature | Status |
|---|---|
| `initialize` (legacy) / `server/discover` (modern) | ✅ both eras |
| Version gate (`-32022`), mirrored `Mcp-*` headers (`-32020`) | ✅ |
| `tools/list`, `tools/call` | ✅ from `api()`, filtered by the same guards |
| `resources/list`, `resources/read` | ✅ pages + skills |
| `ttlMs` / `cacheScope` / `resultType` | ✅ |
| Elicitation — `url` mode, via multi round-trip | ✅ mapped onto proposals |
| Elicitation — `form` mode | ❌ deliberate: the client must not collect an approval |
| `subscriptions/listen` + `notifications/resources/updated` | ✅ driven by revalidation |
| `toolsListChanged`, `promptsListChanged`, `resourcesListChanged` | ❌ the sets are fixed at boot; not advertised, so never promised |
| Sampling (`sampling/createMessage`) | ❌ no use case — a Janux app brings its own models (`@janux/agent`) rather than borrowing the client's |
| Roots (`roots/list`) | ❌ no use case — a web app has nothing to do with the client's filesystem |
| Prompts, completion, logging, pagination (`nextCursor`) | ❌ not implemented |

One practical note: no shipping third-party client speaks `2026-07-28` yet — the official SDK is at `2025-11-25` — so today real clients connect on the legacy path and elicitation is reachable by clients that opt into the modern era. The legacy path is tested against the official SDK for exactly that reason.

## UI tools need a page

Tools without the `api.` prefix operate live islands — they execute in a browser through `window.janux.call(...)`. Headless flows should stick to `api.*` tools; that's what they're for. (If you need headless UI-state automation, run the page under Playwright and drive `window.janux` — `settled()` makes it deterministic.)

## Rules for the road

- Read the resource before acting: `GET` the manifest, then have your client mirror what the built-in copilot does.
- Never invent tool names — the manifest is the contract, regenerated from code on every deploy.
- Treat proposals as the feature they are: your automation *asks*, a human *decides*, the audit trail remembers.
