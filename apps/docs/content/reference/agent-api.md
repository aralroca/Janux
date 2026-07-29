# Agent API

Everything importable from `@janux/agent`.

## defineAgent(config)

```ts
export default defineAgent({
  instructions: 'You are the shop copilot. Prefer proposing over acting.',
  model: 'anthropic/claude-fable-5',            // optional — see resolution order
  modelOptions: { temperature: 0.2 },            // optional — extra provider fields
  maxTurns: 6,                                   // loop cap per request
  tools: { include: ['api.shop.*', 'cart.*'] },  // default: everything mounted
  mcp: { url: 'https://mcp.example.com/mcp' },   // optional — remote MCP tools join the list
});
```

`mcp` connects the agent to remote MCP servers and is documented in [Outbound MCP client](/docs/reference/agent-mcp-client).

Place it in `src/agent.ts` as the default export. With no file at all, every app still gets a working default agent.

### modelOptions

Provider fields merged into **every** model request, on both mounts. What you put here is provider-specific — the framework does not interpret it:

```ts
export default defineAgent({
  model: 'openrouter/deepseek/deepseek-v4-flash',
  modelOptions: {
    reasoning: { enabled: false },      // OpenRouter: skip the thinking pass
    provider: { sort: 'throughput' },   // OpenRouter: route to the fastest provider
  },
});
```

The request the framework builds always wins: `modelOptions` can add `reasoning`, `provider`, `temperature` or `top_p`, and can never rewrite `model`, `messages` or `tools`.

## Model resolution order

1. `defineAgent({ model })` — `'provider/model'` string.
2. `JANUX_MODEL` env var.
3. Provider key sniffing: `ANTHROPIC_API_KEY` → Anthropic default, `OPENAI_API_KEY` → OpenAI default, `GOOGLE_GENERATIVE_AI_API_KEY` → Google default.
4. Nothing found → the endpoint answers `{ type: 'setup', message }` naming the exact variable. The app never crashes over a missing key.

## The turn protocol

`POST /_janux/agent` with `{ messages, path }`. Stateless: the conversation travels with the request.

Responses:

```jsonc
{ "type": "text", "text": "...", "messages": [...], "model": "anthropic/..." }
{ "type": "ui_calls", "calls": [{ "id", "name": "cart.addItem", "input": {...} }], "messages": [...] }
{ "type": "setup", "message": "No model configured. ..." }
```

- Tools prefixed `api.` execute **server-side inside the loop** (agent origin: guards enforced, `confirm` produces server proposals).
- UI tools come back as `ui_calls`: the client executes each through `window.janux.call(...)`, appends `{ role: 'tool', toolCallId, content }` messages, and re-POSTs. Guards and proposals surface on the real page.
- Parallel tool calls are supported; tool results are coalesced per provider requirements.

## Streaming the turn

Ask `/_janux/llm` for a stream with `Accept: text/event-stream` or `{ stream: true }` in the body and the mount answers in the **AI SDK UI Message Stream** vocabulary (v1) instead of one JSON turn:

```txt
x-vercel-ai-ui-message-stream: v1

id: 0
data: {"type":"start"}

id: 2
data: {"type":"text-start","id":"t0"}

id: 3
data: {"type":"text-delta","id":"t0","delta":"An intent"}

data: [DONE]
```

Janux emits the subset a single model turn can produce: `start`, `start-step`, `text-start` / `text-delta` / `text-end`, `tool-input-start` / `tool-input-delta` / `tool-input-available`, `finish-step`, `finish`, and `error` when the provider dies mid-turn. The tool **outputs** are not on this stream — they happen in the page, and [`copilot.stream()`](/docs/recipes/local-model-copilot) splices them in.

Borrowing the vocabulary rather than inventing one is deliberate: anything that already reads it — `useChat`, AI Elements, the AI DevTools — reads a Janux turn with no translator. Two rules matter if you write your own client: `*-start` always precedes its deltas, and the body ends with `data: [DONE]`.

Incremental streaming is implemented for the OpenAI-compatible wire (OpenAI, Google, OpenRouter). Anthropic answers whole and arrives as a single `text-delta` — the chunk sequence is identical either way, so a client never branches on the provider. Whether the answer lands in pieces is a provider property; the protocol is not.

Every event carries an incremental `id:` and the response an `x-janux-stream-id`. Nothing replays them yet: a resume needs a durable buffer the app owns, so a request arriving with `Last-Event-ID` is answered `422 stream_not_resumable` rather than being silently served a second, duplicate turn.

## Message shape

```txt
{ role: 'user' | 'assistant' | 'tool', content: string, toolCalls?: ToolCall[], toolCallId?: string }
```

## Custom mounts (advanced)

An `AgentMount` is `{ handle(req, deps): Promise<Response> }` where `deps` gives you `tools`, `invoke(tool, input)` and `manifestFor(path)` — enough to bring your own loop (or a full framework like Mastra) behind the same endpoint. Pass it as `createJanuxServer({ agent })`.

## Low-level exports (advanced)

The built-in loop is composed from these; import them to build a custom mount or reuse a piece.

| Export | Signature | What it does |
|---|---|---|
| `resolveModel(explicit, env, options?)` | `→ ResolvedModel \| undefined` | Runs the [resolution order](#model-resolution-order) against an env bag. `ResolvedModel` is `{ provider, model, apiKey, source, options? }`; `undefined` means nothing was configured. |
| `setupCard()` | `→ { type: 'setup', message }` | The exact `setup` response the endpoint returns when no model resolves — names the variables to set. |
| `callProvider(model, system, messages, tools, fetch)` | `→ Promise<ProviderReply>` | One provider round-trip, normalized across Anthropic / OpenAI / Google into a `ProviderReply` (`text` and/or `toolCalls`). The `fetch` seam makes it testable and edge-portable. |
| `allowsTool(name, filter)` | `→ boolean` | The one `ToolFilter` semantics of the whole package — `defineAgent({ tools })`, `createCopilot({ tools })` and `defineAgent({ mcp })` all use it: `include` empty/absent means everything, `'api.shop.*'` matches by prefix, anything else exactly, and `exclude` always wins. Import it when your own allowlist must agree with the agent's. |

For the **browser-side** copilot runtime (`@janux/agent/local`: `createCopilot`, `localLlm`, `serverLlm`, `defineTool`, …), see [Local-model copilot](/docs/recipes/local-model-copilot).
