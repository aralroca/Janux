# Local LLM copilot

A tiny task list operated by a copilot that runs the model **in the visitor's browser** over WebGPU — and falls back to the server when it can't. No other framework ships this path end to end.

- **`localLlm()` — the brain lives in the page** — an open-source model (Qwen3-0.6B by default) over Transformers.js/WebGPU. Tools, loop and weights all client-side: nothing leaves the browser.
- **`supportsLocalLlm()` picks the default** — WebGPU feature detection on mount; browsers without it land on `serverLlm()`, the built-in `/_janux/llm` mount (resolved from `JANUX_MODEL` or a provider key).
- **Swap brains at runtime** — the Local ↔ Cloud toggle rebuilds the copilot with the other `Llm`; the model status (not supported / not downloaded / downloading % / ready) is always visible.
- **Consent-gated download** — the ~0.5 GB model never downloads silently: it's behind the "Load model" button, and a chat message in local mode asks for it instead of starting it.
- **Same tools either way** — `createCopilot` exposes the task intents (`tasks.add`, `tasks.toggle`, `tasks.clearDone`) to whichever brain is active; `tasks.toggle` returns the real titles on a miss, which is what turns a small model's hallucinated title into a self-correcting retry.
- **Clean degradation** — with no server model configured, `/_janux/llm` answers its setup card and the chat shows that message instead of crashing.

```bash
bun install
bun run dev   # http://localhost:4321
```

The whole wiring is the recipe's one-liner:

```ts
import { createCopilot, localLlm, serverLlm, supportsLocalLlm } from '@janux/agent/local';

const llm = supportsLocalLlm() ? localLlm() : serverLlm({ stream: true });
const copilot = createCopilot({ llm, visualize: true });
```

## Try the real local model

The e2e suite covers the *mechanics* (detection, fallback, toggle, consent gate, degradation) without running the model — headless CI has no usable WebGPU. The WebGPU path itself is a manual check:

1. Use a browser with WebGPU on: current Chrome, Edge, Firefox, or Safari 26.
2. `bun run dev` and open http://localhost:4321 — the panel should default to **Local**.
3. Press **Load model (~0.5 GB)** and watch the progress; the download lands in the browser cache, so it happens once.
4. When the status says **Model ready**, ask *"add a task called buy oat milk"* — the model calls `tasks.add` in your browser, with the visualizer glowing over the list. Ask with DevTools' network tab open: no request leaves the page.

To try the cloud brain for real, set `JANUX_MODEL="provider/model"` (or one provider API key) before `bun run dev` and flip the toggle to **Cloud**.

## Where things live

| File | What it shows |
|---|---|
| `src/copilot.ts` | The runtime: `supportsLocalLlm()`, one cached `localLlm()` session, `serverLlm({ stream: true })`, and the brain swap that disposes the old loop |
| `src/components/Copilot.tsx` | The panel: detection on `lifecycle.attach`, the Local/Cloud toggle, the model status card and the consent gate |
| `src/components/Tasks.tsx` | The task list: three intents that are the human UI *and* the agent tools, with self-correcting misses |
| `src/routes/index.tsx` | The page: both islands, server-rendered |
| `src/client.ts` | `boot({ defs, glow: true })` |
