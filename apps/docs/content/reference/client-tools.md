# Built-in client tools & the local model

Two things that come with every Janux app: a set of browser tools the copilot always has, and the option to run the whole loop on the user's machine.

```ts
import { CLIENT_TOOL_SPECS, CLIENT_TOOL_NAMES } from 'janux';
import { DEFAULT_LOCAL_MODEL, supportsLocalLlm } from '@janux/agent/local';
```

## CLIENT_TOOL_SPECS

The tools that exist in **every** app, independent of your components — the agent's equivalent of hands and eyes in the browser:

| Tool | What it does |
|---|---|
| `ui_navigate` | Same-origin SPA navigation, query params allowed. Picks the destination from the routes list and the current page's links |
| `ui_get_view_context` | Reads the current view: path, title, same-origin links, mounted components |
| `ui_read_page` | Reads the visible page content |
| `ui_click` | Clicks an element |
| `ui_fill` | Fills a field |
| `ui_wait_settled` | Waits for in-flight work to finish before the next step |

Each spec is `{ name, description, parameters }` with the parameters as JSON Schema, so the list drops straight into a provider's tool array. Descriptions are written *for the model* — `ui_navigate`'s tells it to choose from real links, which is what makes a wrong guess self-correcting.

`ui_wait_settled` is the one people forget: it's how an agent avoids acting on a half-updated page, the same `settled()` guarantee your tests use.

## CLIENT_TOOL_NAMES

A `Set` of those names, for the check you'll actually write — telling a built-in tool from one of your component intents when routing a tool call:

```ts
if (CLIENT_TOOL_NAMES.has(call.name)) {
  // a browser tool: run it in the page
} else {
  // an app tool: component.intent or an api()
}
```

Prefer this over string matching on the `ui_` prefix: the set is generated from the specs, so it can't drift when a tool is added.

## Local model: DEFAULT_LOCAL_MODEL

`DEFAULT_LOCAL_MODEL` is `'onnx-community/Qwen3-0.6B-ONNX'` — the Hugging Face ONNX model `localLlm()` loads when you don't name one. Small on purpose: it downloads in seconds and runs on WebGPU in the page, so a copilot works with **no server and no API key** — including on a fully static export. Override it with `localLlm({ modelId, device: 'webgpu' | 'wasm', dtype, worker })`; pass a `worker` to keep inference off the main thread.

## supportsLocalLlm()

`supportsLocalLlm(): boolean` — feature detection for the browser. Gate the UI on it and fall back to the server model instead of offering an option that will fail:

```ts
const copilot = supportsLocalLlm() ? localLlm() : serverLlm();
```

Related: [A copilot with a local, in-browser model](/docs/recipes/local-model-copilot) · [The agent and your copilot](/docs/guide/agent-and-copilot) · [Client runtime internals](/docs/reference/client-runtime)
