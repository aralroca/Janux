import { createAiSdkLlm, createRemoteLlm } from '@aralroca/gui-agent/ai-sdk';
import type { Llm, LlmRequest, LlmResponse } from '@aralroca/gui-agent';

/** Apache-2.0, ~500 MB in q4f16 and the strongest tool-caller of its size class. */
export const DEFAULT_LOCAL_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';

export interface LocalLlmOptions {
  /** Hugging Face model id (ONNX). Defaults to {@link DEFAULT_LOCAL_MODEL}. */
  modelId?: string;
  device?: 'webgpu' | 'wasm';
  dtype?: string;
  /** Run inference off the main thread (a worker module using `TransformersJSWorkerHandler`). */
  worker?: Worker;
  /** Extra settings forwarded to `generateText` (temperature, maxOutputTokens…). */
  settings?: Record<string, unknown>;
}

export interface LocalLlm extends Llm {
  /** Download the model (or reuse the browser cache) ahead of the first request. */
  load(options?: { onProgress?: (fraction: number) => void }): Promise<void>;
}

/** Whether this browser can run the local model (WebGPU available). */
export function supportsLocalLlm(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function importProvider(): Promise<any> {
  try {
    return await import('@browser-ai/transformers-js');
  } catch (error) {
    throw new Error(
      'janux: localLlm() requires "@browser-ai/transformers-js" and its peers ' +
        `("ai", "@huggingface/transformers") to be installed. (${String(error)})`,
    );
  }
}

async function createSession(options: LocalLlmOptions, onProgress?: (fraction: number) => void): Promise<Llm> {
  const { transformersJS } = await importProvider();
  const model = transformersJS(options.modelId ?? DEFAULT_LOCAL_MODEL, {
    device: options.device ?? 'webgpu',
    dtype: options.dtype ?? 'q4f16',
    ...(options.worker ? { worker: options.worker } : {}),
  });

  await model.createSessionWithProgress((fraction: number) => onProgress?.(fraction));

  return createAiSdkLlm({ model, settings: options.settings });
}

/**
 * An {@link Llm} backed by an open-source model running in the visitor's
 * browser (Transformers.js over WebGPU). The model downloads lazily — call
 * `load()` first to control when (and show progress).
 */
export function localLlm(options: LocalLlmOptions = {}): LocalLlm {
  let session: Promise<Llm> | undefined;

  const ensure = (onProgress?: (fraction: number) => void): Promise<Llm> =>
    (session ??= createSession(options, onProgress));
  const llm = (async (request: LlmRequest): Promise<LlmResponse> => (await ensure())(request)) as LocalLlm;

  llm.load = async ({ onProgress } = {}) => {
    await ensure(onProgress);
  };

  return llm;
}

export interface ServerLlmOptions {
  /** Defaults to the built-in `/_janux/llm` mount. */
  endpoint?: string;
  headers?: Record<string, string>;
}

/**
 * An {@link Llm} backed by the app's server (`/_janux/llm`), where the model
 * and API keys resolve exactly like `defineAgent()`. Same browser-side loop,
 * different brain.
 */
export function serverLlm(options: ServerLlmOptions = {}): Llm {
  return createRemoteLlm({ api: options.endpoint ?? '/_janux/llm', headers: options.headers });
}
