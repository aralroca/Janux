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
import { createCopilot, localLlm, probeLocalLlm, serverLlm } from '@janux/agent/local';

const llm = (await probeLocalLlm()) ? localLlm() : serverLlm();

// Optional, but recommended: download with consent + progress before the first question.
await llm.load?.({ onProgress: (fraction) => render(fraction) });

const copilot = createCopilot({
  llm,
  instructions: 'Help the user operate this app. Ground answers in tool results.',
});

const { text } = await copilot.ask('add two seats to my plan');
```

Narrow the surface with `tools`, the same patterns [`defineAgent`](/docs/reference/agent-api) takes — `include` is an allowlist, `exclude` always wins:

```ts
const copilot = createCopilot({
  llm,
  tools: { exclude: ['api.docs.*'] }, // a client-side defineTool already covers these
});
```

`createCopilot` exposes your manifest tools (intents + `api()` endpoints, `forbidden` excluded, `confirm` annotated) to the model automatically, plus the framework's built-in `navigate` tool — synthesized from the same-origin links already on the page, so "take me to the CLI page" works with zero authoring (define your own `navigate` tool to take the name over). Everything re-syncs on every `ask()` so SPA navigations stay current. Register extra client-side tools with `defineTool` — this site adds `search_docs` / `read_doc` over its static search index, which is how Ask AI reads *and drives* the site with zero backend. When a tool takes ids or paths, validate them and return the real options on a miss — small models hallucinate identifiers, and handing back the valid list is what turns that into a self-correcting retry (`navigate` does exactly this with the page's links).

## Show what the agent is doing

`visualize` turns on the interaction visualizer: a status chip per tool call (spinner → ✓, ✗ on error, blocked when denied), a "Thinking…" indicator between turns, an **animated gradient ring** around the element being operated and a **backdrop veil** that blurs the rest of the page.

```ts
const copilot = createCopilot({
  llm,
  domFallback: true,                                   // read_page / click / fill as a fallback
  visualize: { backdrop: { exclude: ['assistant-panel'] } },   // or just `true`
});
```

It covers every path an action can arrive through, without per-app wiring:

| Action | How the ring finds it |
|---|---|
| One of your intents | `janux:tool-call` → the control it is delegated from, or the [`glowTarget`](/docs/reference/core-api) the intent declares for DOM it creates |
| `domFallback: true` (gui-agent's `read_page` / `click` / `fill`) | the agent's own step stream, which the visualizer already consumes |
| The framework's `ui_click` / `ui_fill` (WebMCP, a server-side agent, your own runner) | `janux:tool-target` |

While it runs, the built-in `boot({ glow })` highlight stands down, so nothing is painted twice.

The chip list is appended to `<body>` marked `data-janux-agent-steps` (and `data-janux-keep`, so a navigation can't take it down) — position and theme it from your CSS:

```css
[data-janux-agent-steps] { position: fixed; right: 24px; bottom: 84px; z-index: 10; }
```

Pass `container` to place it yourself, and `copilot.visualizer` gives you the underlying visualizer once a run has built it — `highlight(target)` accepts an element **or a CSS selector**, polled briefly until it mounts. Options mirror gui-agent's `AgentVisualizerOptions` (`chips`, `highlight`, `labels`, `glowDuration`, `glowDwell`, `theme`, `backdrop`); `labels` are keyed by your own tool names (`'cart.addItem'`), sanitized for the model on your behalf.

The overlay is built on the **first `ask()`**, not when the copilot is created, and each run starts from a clean chip list — a copilot wired up front but never used costs nothing and leaves the built-in glow in charge.

## Picking a model

`localLlm()` defaults to [`onnx-community/Qwen3-0.6B-ONNX`](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX). Swap with `localLlm({ modelId })`:

| Model | Download | License | Notes |
| --- | --- | --- | --- |
| `onnx-community/Qwen3-0.6B-ONNX` | ~0.5 GB | Apache-2.0 | Default. Best tool-calling of its size; append `/no_think` to your instructions for snappy answers. |
| `onnx-community/LFM2-1.2B-ONNX` | ~0.7 GB | LFM Open License | Fastest decode, strong tool calling. Check the license fits your use. |
| `onnx-community/SmolLM3-3B-ONNX` | ~2 GB | Apache-2.0 | Smartest of the three; heavy first download for casual visitors. |

The model downloads once and lands in the browser cache. Small models can't memorize your app or docs — give them retrieval tools (search + read) and say so in `instructions`.

## Local ↔ server, symmetric

`serverLlm()` posts each turn to the built-in `/_janux/llm` mount — a stateless one-turn proxy that resolves the model exactly like [`defineAgent()`](/docs/guide/agent-and-copilot) (`JANUX_MODEL` / provider API keys). Tools still execute in the page. When the mount refuses (no model configured, rate limited), the error carries the mount's own message in both modes, streaming or not — show it in the chat and the setup card explains itself. Typical policy:

```ts
const llm = (await probeLocalLlm()) ? localLlm() : serverLlm();
```

On a static deploy there is no `/_janux/llm`, so the local model isn't a nice-to-have there — it's the only brain available.

## Streaming the answer

`serverLlm({ stream: true })` reads the turn as the model writes it. The loop is unchanged — it still awaits one `{ text, toolCalls }` per turn — but the chunks are available while it waits:

```ts
const llm = serverLlm({ stream: true });

llm.subscribe((chunk) => {
  if (chunk.type === 'text-delta') appendToBubble(chunk.delta);
});
```

For the whole run rather than one turn, `copilot.stream()` returns a `ReadableStream` of [UI Message Stream](/docs/reference/agent-api#streaming-the-turn) chunks — the server's text and tool inputs **merged with the tool outputs the page produced**, which is the half no server-side stream can know about:

```ts
for await (const chunk of copilot.stream('take me to the CLI page')) {
  if (chunk.type === 'text-delta') appendToBubble(chunk.delta);
  if (chunk.type === 'tool-input-available') showChip(chunk.toolName);
  if (chunk.type === 'tool-output-available') completeChip(chunk.toolCallId);
}
```

It works with any `Llm`: with `localLlm()` (or a `serverLlm()` without `stream`) there are no deltas to forward, so the final answer arrives as one `text-delta` and the tool chunks are unaffected. Pass an `AbortSignal` to stop a run — the stream closes with an `abort` chunk.

`for await` over a `ReadableStream` is not in every engine yet (Safari); `stream.getReader()` in a `while` loop is the portable form, and it is what this site's Ask AI uses.

## Test a turn without a GPU

`localLlm({ provider })` swaps the model factory — the same interface as `@browser-ai/transformers-js` — so a test can script a whole local turn (tool call included) with no WebGPU and no download. The stub's model is a plain AI SDK model:

```ts
import { localLlm, type LocalLlmProvider } from '@janux/agent/local';

const provider: LocalLlmProvider = {
  transformersJS: () => ({
    createSessionWithProgress: async (onProgress) => onProgress(1),
    // ...an AI SDK LanguageModel: `doGenerate` answering your script.
  }),
};
const llm = localLlm({ provider });
```

This is how the `with-local-llm` example's e2e runs a real local turn in headless CI: the page injects a scripted provider, presses the real "Load model" button and watches the model's `tasks_add` tool call land on the task list.

## Requirements & gotchas

- **WebGPU**: enabled by default in current Chrome, Edge, Firefox and Safari 26. `supportsLocalLlm()` is the sync fast-path (`navigator.gpu` exists); `probeLocalLlm()` asks for a real adapter — headless browsers expose `navigator.gpu` with none — with a short timeout and a cached verdict. Gate the default brain on the probe.
- **Consent**: never start a ~0.5 GB download silently — gate it behind a click, like this site's Ask AI does.
- **Off the main thread**: pass `localLlm({ worker })` a worker module wired to `TransformersJSWorkerHandler` from `@browser-ai/transformers-js` to keep the page smooth during generation.
- **Lazy by construction**: `import('@janux/agent/local')` from your copilot UI instead of importing it statically — the agent runtime then loads only when the panel is first used (this site does exactly that), and the model weights only after `load()`. Dynamic imports are cached, so it all happens once.
