# Agent API

Everything importable from `@janux/agent`.

## defineAgent(config)

```ts
export default defineAgent({
  instructions: 'You are the shop copilot. Prefer proposing over acting.',
  model: 'anthropic/claude-fable-5',            // optional — see resolution order
  maxTurns: 6,                                   // loop cap per request
  tools: { include: ['api.shop.*', 'cart.*'] },  // default: everything mounted
});
```

Place it in `src/agent.ts` as the default export. With no file at all, every app still gets a working default agent.

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
| `resolveModel(explicit, env)` | `→ ResolvedModel \| undefined` | Runs the [resolution order](#model-resolution-order) against an env bag. `ResolvedModel` is `{ provider, model, apiKey, source }`; `undefined` means nothing was configured. |
| `setupCard()` | `→ { type: 'setup', message }` | The exact `setup` response the endpoint returns when no model resolves — names the variables to set. |
| `callProvider(model, system, messages, tools, fetch)` | `→ Promise<ProviderReply>` | One provider round-trip, normalized across Anthropic / OpenAI / Google into a `ProviderReply` (`text` and/or `toolCalls`). The `fetch` seam makes it testable and edge-portable. |

For the **browser-side** copilot runtime (`@janux/agent/local`: `createCopilot`, `localLlm`, `serverLlm`, `defineTool`, …), see [Local-model copilot](/docs/recipes/local-model-copilot).
