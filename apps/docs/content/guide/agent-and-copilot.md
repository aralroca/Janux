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
- `{ type: 'ui_calls', calls, messages }` — the model wants to operate the UI. The client executes each call through the bridge (`window.janux.call`) and re-POSTs `{ continuation: true, toolResults, path }` — the **same turn resumes** against the (possibly new) path's manifest, so navigate-then-act flows work end to end.
- `{ type: 'setup', message }` — no model configured.

There is a second, simpler mount for browser-side loops: `POST /_janux/llm` takes `{ messages, tools }` and returns a single model turn (`{ text, toolCalls }`) — the `serverLlm()` transport of [`@janux/agent/local`](/docs/recipes/local-model-copilot). Model resolution is identical; tools always execute in the page.

Tools prefixed `api.` execute **server-side inside the loop**; UI tools always cross the bridge so guards and proposals surface on the real page. `confirm` guards mean the copilot can *propose* checkout, but a human approves it on the UI.

### Built-in client tools (app-wide control)

Next to the mounted page's tools, every agent turn also advertises six built-ins — no authoring needed:

| Tool | What it does |
|---|---|
| `ui_navigate { path }` | SPA-navigates to any same-origin path. The system prompt carries the **full route map** (every router pattern), so the model can reach pages that are not mounted. |
| `ui_get_view_context` | Current path, title, links and mounted components. |
| `ui_read_page` | Accessibility snapshot (headings/buttons/inputs/links with stable selectors) — the DOM fallback when no dedicated tool exists. |
| `ui_click { selector }` / `ui_fill { selector, value }` | Operate elements from the snapshot, with the same activity glow as intents. |
| `ui_wait_settled` | Deterministic quiescence via `janux.settled()` — call after navigation before reading state. |

They execute in the browser bridge (`window.janux.call('ui_navigate', …)` works for any consumer: the embedded copilot, WebMCP or your own runner). Contracts live in `CLIENT_TOOL_SPECS` (exported from `janux`).

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

## The embedded harness (stateful agents)

A production copilot is a long-lived agent, not a stateless loop. `defineAgent` grows into the harness with one opt-in config block — enable only the pieces you need:

```ts
// src/agent.ts
import { defineAgent, createMemory, createPgStorage, unicodeNormalizer, historyTokenBudget, piiFilter, injectionGuard } from '@janux/agent';

const storage = await createPgStorage({ connectionString: process.env.DATABASE_URL! });

export default defineAgent({
  instructions: 'You are the Didit console copilot…',
  harness: {
    memory: createMemory({ storage, lastMessages: 20, generateTitle: async (first) => titleFor(first) }),
    processors: [unicodeNormalizer(), injectionGuard(classify), historyTokenBudget(24_000), piiFilter()],
    rateLimit: { limit: 20, windowMs: 60_000, store: await createRedisCounterStore({ redis: REDIS_URL }) },
    identityFor: (req) => verifyBearer(req),        // fail-closed: undefined → 401
  },
});
```

What each piece gives you:

- **Memory** — thread-aware turns: the client sends only the new user message plus `threadId`; the bounded history comes from storage, replies are remembered, titles generate lazily, and threads are ownership-scoped (`403` on cross-identity access). Storage is an adapter: in-memory for dev/tests, `createPgStorage` for production (auto-creates `janux_*` tables).
- **Processors** — the guardrail pipeline runs before the model: NFKC normalization, prompt-injection classification (`{type:'refusal'}` without ever calling the provider), history token budget (drops oldest first, never the system prompt or the newest turn), PII scrubbing.
- **Rate limiting** — fixed-window per identity + optional global circuit-breaker over a pluggable counter store (`createRedisCounterStore` shares the window across instances). Fails open on store outages; `429` on exceed.
- **Durable workflows** — `createWorkflow`/`createStep` + `createWorkflowRunner(storage)`: a step calls `suspend(payload)` and the run snapshot persists by run id — it survives restarts and resumes from another instance, with callables re-supplied via `requestContext`. The one-question-per-suspend interview pattern is first-class.
- **Outbound MCP** — `connectMcp({ url, token, namespace })` turns any remote MCP server into `AgentTool`s (the hosted Didit MCP, a docs MCP…); `createMcpPool()` caches per user token and evicts dead connections.
- **Attachments** — `acceptAttachments` validates type/size/count and assigns stable `att_N` refs.

Without `harness`, `defineAgent` stays the zero-config stateless loop — a static site pays nothing.
