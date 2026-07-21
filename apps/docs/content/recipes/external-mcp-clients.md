# Driving a Janux app from an external MCP client

Every Janux app is an MCP-style surface over HTTP. Your copilot uses it — but so can Claude Code, a CI script, or any agent you run elsewhere.

## Discovery

```bash
curl -s 'https://your.app/_janux/manifest?path=/shop' | jq
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

## UI tools need a page

Tools without the `api.` prefix operate live islands — they execute in a browser through `window.janux.call(...)`. Headless flows should stick to `api.*` tools; that's what they're for. (If you need headless UI-state automation, run the page under Playwright and drive `window.janux` — `settled()` makes it deterministic.)

## Rules for the road

- Read the resource before acting: `GET` the manifest, then have your client mirror what the built-in copilot does.
- Never invent tool names — the manifest is the contract, regenerated from code on every deploy.
- Treat proposals as the feature they are: your automation *asks*, a human *decides*, the audit trail remembers.
