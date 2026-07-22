# The agent and your copilot

Every Janux app embeds an agent runtime. Zero config: with no `src/agent.ts` at all, the app has a working copilot endpoint whose tools are your mounted intents plus your api() functions.

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

External MCP clients get the same surface over HTTP: `GET /_janux/manifest?path=/shop` for discovery, `POST /_janux/api/*` (with `x-janux-origin: agent`) for server tools.

## WebMCP — zero config

`boot()` also registers the whole surface with the browser's [WebMCP](https://developer.chrome.com/docs/ai/webmcp) API (`document.modelContext`), so browser-native agents and Chrome's DevTools WebMCP panel see your tools with no setup. Browsers without the API get a spec-shaped polyfill, so tests and in-page agents can drive `document.modelContext` everywhere. Registration re-syncs on every SPA navigation; opt out with `boot({ webmcp: false })`. See the [debugging recipe](/docs/recipes/debugging-webmcp).

## Building your own copilot UI

The copilot chrome is just another Janux component (see the shop example's `Copilot.tsx`): messages in schema state, a `send` intent that runs the turn protocol, and human-only (`guard: 'forbidden'`) `approve`/`reject` intents — so the agent can never approve its own proposals.
