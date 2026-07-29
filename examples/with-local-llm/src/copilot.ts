/**
 * The copilot runtime, loaded lazily from the panel (dynamic imports are
 * cached, so the agent code arrives once). The brain is pluggable at runtime:
 * `localLlm()` runs an open-source model in the visitor's browser (WebGPU),
 * `serverLlm()` posts each turn to the built-in `/_janux/llm` mount. Same
 * loop, same tools — different brain.
 */
import {
  createCopilot,
  localLlm,
  probeLocalLlm,
  serverLlm,
  type Copilot,
  type LocalLlm,
  type LocalLlmProvider,
} from '@janux/agent/local';

export type Brain = 'local' | 'cloud';

/** Qwen3 skips its thinking preamble with `/no_think` — snappier on 0.6B. */
const INSTRUCTIONS =
  'You operate a small task list. Use the tools to act and ground every answer in tool results. /no_think';

let localModel: LocalLlm | undefined;
let active: { brain: Brain; copilot: Copilot } | undefined;

/** Test seam: the e2e injects a scripted provider to run a real local turn without a GPU. */
const injectedProvider = (): LocalLlmProvider | undefined => (window as any).__localLlmProvider;

/** Whether this browser can run the model itself: a real `requestAdapter()` probe, not just `'gpu' in navigator`. */
export function detect(): Promise<boolean> {
  return probeLocalLlm();
}

/** One session per page: swapping brains must not re-download the weights. */
function localBrain(): LocalLlm {
  return (localModel ??= localLlm({ provider: injectedProvider() }));
}

/** Download the model (or reuse the browser cache), reporting progress 0..1. */
export function loadModel(onProgress: (fraction: number) => void): Promise<void> {
  return localBrain().load({ onProgress });
}

/** One copilot at a time: a swap disposes the old loop, the model cache stays. */
function copilotFor(brain: Brain): Copilot {
  if (active?.brain === brain) return active.copilot;
  active?.copilot.dispose();
  const copilot = createCopilot({
    llm: brain === 'local' ? localBrain() : serverLlm(),
    instructions: INSTRUCTIONS,
    visualize: { backdrop: { exclude: ['assistant-panel'] } },
  });

  active = { brain, copilot };

  return copilot;
}

/** Answers one question with whichever brain the panel currently selects. */
export function ask(brain: Brain, question: string): Promise<{ text: string }> {
  return copilotFor(brain).ask(question);
}
