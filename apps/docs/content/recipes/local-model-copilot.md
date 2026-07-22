# A copilot with a local, in-browser model

`@janux/agent/local` moves the whole agent loop into the visitor's browser: an open-source model runs on their machine (Transformers.js over WebGPU), calls your app's tools, and nothing leaves the page. It powers this site's own **Ask AI** — including on `output: "static"` deploys, where there is no server at all.

The loop comes from [`@aralroca/gui-agent`](https://github.com/aralroca/gui-agent) (the same WebMCP surface `installWebMCP` feeds); the model is pluggable: `localLlm()` runs it in the browser, `serverLlm()` keeps it on your server. Same loop, different brain.

## Install

```bash
bun add @browser-ai/transformers-js @huggingface/transformers
```

`@janux/agent` already ships the loop and the `ai` runtime; the two packages above are only needed for `localLlm()`. Always import agent pieces (`defineTool`, `registry`, …) from `@janux/agent/local`, not from `@aralroca/gui-agent` directly — that guarantees your tools land in the same registry the copilot reads.

## Wire it

```ts
import { createCopilot, localLlm, serverLlm, supportsLocalLlm } from '@janux/agent/local';

const llm = supportsLocalLlm() ? localLlm() : serverLlm();

// Optional, but recommended: download with consent + progress before the first question.
await llm.load?.({ onProgress: (fraction) => render(fraction) });

const copilot = createCopilot({
  llm,
  instructions: 'Help the user operate this app. Ground answers in tool results.',
});

const { text } = await copilot.ask('add two seats to my plan');
```

`createCopilot` exposes your manifest tools (intents + `api()` endpoints, `forbidden` excluded, `confirm` annotated) to the model automatically, plus the framework's built-in `navigate` tool — synthesized from the same-origin links already on the page, so "take me to the CLI page" works with zero authoring (define your own `navigate` tool to take the name over). Everything re-syncs on every `ask()` so SPA navigations stay current. Register extra client-side tools with `defineTool` — this site adds `search_docs` / `read_doc` over its static search index, which is how Ask AI reads *and drives* the site with zero backend. When a tool takes ids or paths, validate them and return the real options on a miss — small models hallucinate identifiers, and handing back the valid list is what turns that into a self-correcting retry (`navigate` does exactly this with the page's links).

## Picking a model

`localLlm()` defaults to [`onnx-community/Qwen3-0.6B-ONNX`](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX). Swap with `localLlm({ modelId })`:

| Model | Download | License | Notes |
| --- | --- | --- | --- |
| `onnx-community/Qwen3-0.6B-ONNX` | ~0.5 GB | Apache-2.0 | Default. Best tool-calling of its size; append `/no_think` to your instructions for snappy answers. |
| `onnx-community/LFM2-1.2B-ONNX` | ~0.7 GB | LFM Open License | Fastest decode, strong tool calling. Check the license fits your use. |
| `onnx-community/SmolLM3-3B-ONNX` | ~2 GB | Apache-2.0 | Smartest of the three; heavy first download for casual visitors. |

The model downloads once and lands in the browser cache. Small models can't memorize your app or docs — give them retrieval tools (search + read) and say so in `instructions`.

## Local ↔ server, symmetric

`serverLlm()` posts each turn to the built-in `/_janux/llm` mount — a stateless one-turn proxy that resolves the model exactly like [`defineAgent()`](/docs/guide/agent-and-copilot) (`JANUX_MODEL` / provider API keys). Tools still execute in the page. Typical policy:

```ts
const llm = supportsLocalLlm() ? localLlm() : serverLlm();
```

On a static deploy there is no `/_janux/llm`, so the local model isn't a nice-to-have there — it's the only brain available.

## Requirements & gotchas

- **WebGPU**: enabled by default in current Chrome, Edge, Firefox and Safari 26; `supportsLocalLlm()` feature-detects it.
- **Consent**: never start a ~0.5 GB download silently — gate it behind a click, like this site's Ask AI does.
- **Off the main thread**: pass `localLlm({ worker })` a worker module wired to `TransformersJSWorkerHandler` from `@browser-ai/transformers-js` to keep the page smooth during generation.
- **Lazy by construction**: `import('@janux/agent/local')` from your copilot UI instead of importing it statically — the agent runtime then loads only when the panel is first used (this site does exactly that), and the model weights only after `load()`. Dynamic imports are cached, so it all happens once.
