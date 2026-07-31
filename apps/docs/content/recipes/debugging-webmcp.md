---
title: Debugging agent tools with Chrome's WebMCP panel
description: Chrome DevTools ships a WebMCP pane that shows every client-side tool a page exposes to AI agents, with its schema and a live call log.
---

# Debugging agent tools with Chrome's WebMCP panel

Chrome DevTools ships a **WebMCP** pane (Application → WebMCP) that shows every client-side tool a page exposes to AI agents — registration, schemas and a full invocation log. Janux speaks WebMCP out of the box: `boot()` registers every tool from the manifest with `document.modelContext` and re-syncs on every SPA navigation. Zero config — you only need a Chrome that has the panel.

## 1. Enable WebMCP in Chrome

The API is an origin trial (from Chrome 149) and stays behind flags for local development:

1. Check `chrome://version` — you need Chrome 149+ (or Canary if your stable is older; stable/beta below 149 don't have the flags at all).
2. Open `chrome://flags` and enable **both**:
   - `#enable-webmcp-testing` — turns on the `modelContext` API for pages.
   - `#devtools-webmcp-support` — turns on the DevTools pane (newer versions ship it by default).
3. Relaunch Chrome.

Verify in the Console:

```js
'modelContext' in document; // always true on a Janux page — native or polyfilled
document.modelContext.polyfilled; // true → Janux's polyfill; undefined → the real API
```

## 2. What Janux registers, and how

On boot (and after each navigation) Janux merges the route manifest (`/_janux/manifest?path=…` — includes lazy islands and `api.*` server functions) with the live local manifest, then registers each tool:

- Names are sanitized for WebMCP: `counter.inc` → `counter_inc`, `api.shop.pay` → `api_shop_pay`.
- Execution still crosses the bridge: UI tools run through `window.janux.call(...)`, `api.*` tools POST to `/_janux/api/*` with `x-janux-origin: agent`. Guards behave exactly as in the copilot — `auto` executes, `confirm` returns a proposal (the description says so), `forbidden` was never in the manifest.
- In browsers without WebMCP, Janux installs a spec-shaped polyfill so the same surface is drivable from tests and in-page agents: `document.modelContext.registerTool(...)` works everywhere, and the polyfill adds `listTools()` / `callTool(name, input)` for gui-agent-style automation (Playwright, unit tests).

Opt out with `boot({ webmcp: false })`, or drive it manually with `installWebMCP(bridge)` from `janux/client`.

## 3. Read the panel

Open DevTools → **Application** → **WebMCP** on the page:

- **Available tools** — the live tool list with name, description and an invocation counter per tool. The counter's status icons are clickable and filter the log.
- **Invoked tools** — a chronological log. Select an entry to inspect its **status** (Completed, Canceled, In Progress, Error), the exact **input** the agent sent, and the **output** or error message.

Janux specifics to keep in mind while reading the log:

- A `confirm`-guarded tool shows **Completed** with `{ "status": "proposal", ... }` as output — that's correct behavior, not a silent success. The real execution happens on `janux.approve(id)`.
- Schema violations reject inside `janux.call`, so they surface as **Error** entries with the validation message — the fastest way to catch an agent sending `{"by": "1"}` where `int()` was expected.
- The panel and the `janux:tool-call` DOM events (what powers the glow) fire for the same calls; if one shows activity the other should too.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No WebMCP entry in the Application sidebar | Wrong channel/version or `#devtools-webmcp-support` off — recheck step 1 |
| Panel present but empty on a Janux page | The page never ran `boot()` (static 0-JS route), or `webmcp: false` is set |
| `document.modelContext.polyfilled` is `true` | Fine for tests; for the DevTools panel you need the real API — enable `#enable-webmcp-testing` |
| Tools missing after navigating | Re-sync is automatic on SPA navigations; a full reload means `boot()` runs again anyway — check the Console for `janux:error` events |
