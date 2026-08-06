---
title: Errors and warnings
description: The runtime and build messages Janux emits — every one prefixed "Janux:" — grouped by where they come from, with what each means and how to fix it.
---

# Errors and warnings

Everything Janux reports — thrown, logged, or dispatched as a `janux:error` DOM event — carries the `Janux:` prefix, so a console filter on that string shows only the framework's own diagnostics. This page covers the messages you are most likely to meet, what each one means, and the fix.

## Views and islands

**`a <For> row must render exactly one element`** — a `<For>` row body returned a fragment or several siblings. Each row needs one root element so the list can key, move and dispose it as a unit. Wrap the row in a single container.

**`<X> cannot be rendered inside <For> — lift it out of the row body`** — islands and foreign components cannot live inside a row: rows are created and destroyed by the list's own reactive scope, outside the island registry. Render them as siblings of the list, or restructure so the island wraps the list.

**`nested island <X> outside an island render pass`** / **`foreign <X> outside an island render pass`** — an island or `foreign()` component was rendered from plain page JSX. Both need the surrounding island machinery: register them in `boot({ defs })` and render them inside an island (or at document level for foreigns).

**`duplicate island key "x" — using "x~2"`** — two islands resolved to the same key, so the second was renamed to keep both addressable. Agent tool names are derived from these keys; pass an explicit `key` to keep them stable.

**`"onClick" expects a named intent — a plain function has no name, schema or guard, so it was dropped`** — event props take intents, not closures: an anonymous function has no schema for an agent to call, no guard to enforce, and no name to delegate by. Declare an `intent()` and pass `intents.yourName` instead. See [Intents and guards](/docs/guide/intents-and-guards).

**`two event props resolve to the same marker`** — two handlers on one element normalize to the same delegated event name (e.g. `onInput` and `oninput`). Keep one.

**`foreign <X> failed to server-render`** — the React component inside `foreign()` threw during SSR. The message includes the underlying error; the island still mounts client-side. See [React interop](/docs/guide/interop).

## State

**`cannot store a <type> in state`** / **`cannot store a cycle in state`** — island state must survive a serialization round-trip (that is what resumes on the client and what agents diff). Functions, DOM nodes, class instances and cyclic graphs cannot; keep them in module scope or a signal outside `state`.

**`illegal mutation of <path> outside an intent, effect or event handler`** — state was written from somewhere with no declared `run()` on the stack (for example, view code during render). Writes go through declared bodies so proposals, audit and agent diffs see them. Move the write into an `intent()`, `effect()` or event handler run.

**`discarded an invalid state snapshot for <uri>`** / **`discarded an invalid state patch for <uri>`** — an embedded state script or a streamed patch failed to parse; the island falls back to its initial state instead of crashing. Usually a proxy or CDN transformed the HTML — compare the served page with the built one.

## Intents, APIs and tools

**`intent() requires run()`** / **`api() requires run()`** / **`effect() requires run()`** / **`source() requires query()`** — the factory was called without its executable part. Every declaration needs the function that does the work.

**`<kind> needs a kebab-case name`** — component, store, api and intent names become tool names and wire markers, so they are constrained to kebab-case.

**`unknown tool <name>`** / **`malformed tool name`** — an agent called a tool that no mounted island declares. Tool names are `component.intent`; the manifest at `/_janux/manifest` lists what actually exists on the page.

**`unknown proposal <id>`** — an approval arrived for a proposal already settled on this page. Approvals are one-shot; re-propose by re-running the intent.

**`invalid payload for <tool>`** — an agent's input failed the intent's schema. The schema is the contract: fix the caller, not the guard.

## Server and rendering

**`dropped the relative meta URL "…" — og:image and canonical must be absolute. Set siteUrl in janux.config.ts to resolve them`** — social cards and canonical links need absolute URLs. Set [`siteUrl`](/docs/reference/cli#all-config-fields) and the server resolves relative meta for you.

**`blocked an executable URL in <attribute>`** — a `javascript:` (or similarly executable) URL reached an attribute during render and was dropped. This is the HTML-injection guard doing its job; if the value is dynamic, validate it upstream.

**`render failed mid-stream`** — a component threw after the shell was already streaming, so the server appended the error marker instead of half a page. The cause is in the server log right above this line.

## Boot and client

**`boot({ glow: true }) no longer ships the feedback layer`** — the feedback layers became imports so unused ones ship zero bytes: pass `glow: agentGlow()` / `cursor: agentCursor()` from `janux/client` instead of booleans. See the [client API](/docs/reference/client-api).

**`service worker registration failed`** — the browser rejected the worker (usually a scope or HTTPS issue in development). The app keeps working without offline support. See [Service workers](/docs/guide/service-workers).

**`unregistering a service worker left on this origin by a production build — reloading`** — a previous production build's worker was still controlling the origin when a dev server started; Janux removes it and reloads once so dev assets stop being served from the stale cache. Expected exactly once after switching a port from a production preview back to dev.

## Reading an error from an agent's side

Agents get the same diagnostics through the wire: a failed tool call returns the message in the MCP error payload, and every client-side failure is also dispatched as a `janux:error` DOM event, so an island can subscribe and surface them. See [Debugging WebMCP](/docs/recipes/debugging-webmcp).
