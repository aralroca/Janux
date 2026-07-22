# The agent and your copilot

Every Janux app embeds an agent runtime. Zero config: with no `src/agent.ts` at all, the app has a working copilot endpoint whose tools are your mounted intents plus your api() functions.

The loop can run in two places: on the server (`/_janux/agent`, this page) or **in the visitor's browser** with a pluggable model — including an open-source one running on their machine over WebGPU. For the browser-side runtime (`@janux/agent/local`, which powers this site's Ask AI), see the [local-model copilot recipe](/docs/recipes/local-model-copilot).

## Configuring the model

Resolution order (first match wins):

1. `defineAgent({ model: 'anthropic/claude-fable-5' })`
2. `JANUX_MODEL=provider/model` environment variable
3. Provider-key sniffing: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` present → that provider's default model
4. Nothing found → the endpoint answers with a **setup card** naming the exact variable to set. The app never crashes over a missing key.

```ts
// src/agent.ts (optional)
import { defineAgent } from '@janux/agent';

export default defineAgent({
  instructions: 'You are the shop copilot. Prefer proposing over acting.',
  model: 'anthropic/claude-fable-5',          // optional
  tools: { include: ['api.shop.*', 'cart.*'] }, // optional; default: everything mounted
  maxTurns: 6,
});
```

## The turn protocol

`POST /_janux/agent` with `{ messages, path }` returns one of:

- `{ type: 'text', text, messages, model }` — final answer.
- `{ type: 'ui_calls', calls, messages }` — the model wants to operate the UI. The client executes each call through the bridge (`window.janux.call`), appends the results as tool messages, and re-POSTs. Stateless by design: the conversation travels with the request.
- `{ type: 'setup', message }` — no model configured.

There is a second, simpler mount for browser-side loops: `POST /_janux/llm` takes `{ messages, tools }` and returns a single model turn (`{ text, toolCalls }`) — the `serverLlm()` transport of [`@janux/agent/local`](/docs/recipes/local-model-copilot). Model resolution is identical; tools always execute in the page.

Tools prefixed `api.` execute **server-side inside the loop**; UI tools always cross the bridge so guards and proposals surface on the real page. `confirm` guards mean the copilot can *propose* checkout, but a human approves it on the UI.

## The bridge (gui-agent surface)

Every page exposes `window.janux`:

```ts
await janux.read('ui://cart');            // typed resource snapshot
await janux.call('cart.addItem', {...});  // guard-checked tool call
await janux.settled();                    // quiescence
janux.subscribe('cart.checkedOut', fn);   // typed events
janux.manifest();                         // live manifest of the mounted tree
```

External MCP clients get the same surface over HTTP: `GET /_janux/manifest?path=/shop` for discovery, `POST /_janux/api/*` (with `x-janux-origin: agent`) for server tools. Two optional server features round this out: `llmsTxt` serves a `GET /llms.txt` index of pages and tools for agents that discover the site through the web (dynamic routes list their real pages via `staticParams`), and `agents.webBotAuth` verifies signed agent requests (RFC 9421) into `ctx.agent` — see the [Server API](/docs/reference/server-api). The contract is also testable: `janux verify` fails CI when an agent-reachable tool lacks a description, and `janux eval` replays scripted agent tasks against a live app — see the [CLI reference](/docs/reference/cli).

## WebMCP — zero config

`boot()` also registers the whole surface with the browser's [WebMCP](https://developer.chrome.com/docs/ai/webmcp) API (`document.modelContext`), so browser-native agents and Chrome's DevTools WebMCP panel see your tools with no setup. Browsers without the API get a spec-shaped polyfill, so tests and in-page agents can drive `document.modelContext` everywhere. Registration re-syncs on every SPA navigation; opt out with `boot({ webmcp: false })`. See the [debugging recipe](/docs/recipes/debugging-webmcp).

The surface always includes a built-in `navigate` tool, synthesized from the same-origin `<a href>` links your JSX already renders — agents can move through the app exactly like a reader, with no authoring. Off-page paths are rejected with the list of real links (self-correcting for small models); registering your own tool named `navigate` takes the name over.

## Building your own copilot UI

The copilot chrome is just another Janux component (see the shop example's `Copilot.tsx`): messages in schema state, a `send` intent that runs the turn protocol, and human-only (`guard: 'forbidden'`) `approve`/`reject` intents — so the agent can never approve its own proposals.
