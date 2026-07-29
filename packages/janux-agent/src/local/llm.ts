import { createAiSdkLlm, createRemoteLlm } from '@aralroca/gui-agent/ai-sdk';
import type { Llm, LlmRequest, LlmResponse } from '@aralroca/gui-agent';
import type { UIMessageChunk } from 'ai';
import { sseData } from '../sse';

/** Apache-2.0, ~500 MB in q4f16 and the strongest tool-caller of its size class. */
export const DEFAULT_LOCAL_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';

/** What `localLlm()` needs from a provider's model: the session download plus the AI SDK model itself. */
export interface LocalLlmModel {
  createSessionWithProgress(onProgress: (fraction: number) => void): Promise<unknown>;
}

/** The interface of `@browser-ai/transformers-js` — inject a stub to test a turn without WebGPU. */
export interface LocalLlmProvider {
  transformersJS(modelId: string, config: Record<string, unknown>): LocalLlmModel;
}

export interface LocalLlmOptions {
  /** Hugging Face model id (ONNX). Defaults to {@link DEFAULT_LOCAL_MODEL}. */
  modelId?: string;
  device?: 'webgpu' | 'wasm';
  dtype?: string;
  /** Run inference off the main thread (a worker module using `TransformersJSWorkerHandler`). */
  worker?: Worker;
  /** Extra settings forwarded to `generateText` (temperature, maxOutputTokens…). */
  settings?: Record<string, unknown>;
  /** Model factory. Defaults to importing `@browser-ai/transformers-js`. */
  provider?: LocalLlmProvider;
}

export interface LocalLlm extends Llm {
  /** Download the model (or reuse the browser cache) ahead of the first request. */
  load(options?: { onProgress?: (fraction: number) => void }): Promise<void>;
}

/** How long {@link probeLocalLlm} waits for `requestAdapter()` before calling WebGPU unusable. */
const PROBE_TIMEOUT_MS = 1_000;
/** Keyed by the `navigator.gpu` object itself: one probe per page, and tests get a fresh cache per fake gpu. */
const probes = new WeakMap<object, Promise<boolean>>();

/**
 * Sync fast-path: whether the browser exposes WebGPU at all. Headless browsers
 * expose `navigator.gpu` with no usable adapter — {@link probeLocalLlm} asks
 * for one and is the check to trust before defaulting to the local brain.
 */
export function supportsLocalLlm(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export interface ProbeOptions {
  /** Defaults to {@link PROBE_TIMEOUT_MS} (1s). A hung probe resolves `false` — degrade, don't stall. */
  timeoutMs?: number;
}

function usableAdapter(gpu: any, timeoutMs: number): Promise<boolean> {
  const adapter = Promise.resolve()
    .then(() => gpu.requestAdapter?.())
    .then(Boolean, () => false);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));

  return Promise.race([adapter, timeout]);
}

/** Whether this browser can *actually* run the local model: a real `requestAdapter()` probe, cached. */
export function probeLocalLlm({ timeoutMs = PROBE_TIMEOUT_MS }: ProbeOptions = {}): Promise<boolean> {
  const gpu = supportsLocalLlm() ? (navigator as any).gpu : undefined;

  if (!gpu) return Promise.resolve(false);
  const probe = probes.get(gpu) ?? usableAdapter(gpu, timeoutMs);

  probes.set(gpu, probe);

  return probe;
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
  const { transformersJS } = options.provider ?? (await importProvider());
  const model = transformersJS(options.modelId ?? DEFAULT_LOCAL_MODEL, {
    device: options.device ?? 'webgpu',
    dtype: options.dtype ?? 'q4f16',
    ...(options.worker ? { worker: options.worker } : {}),
  });

  await model.createSessionWithProgress((fraction: number) => onProgress?.(fraction));

  return createAiSdkLlm({ model: model as any, settings: options.settings });
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
  /**
   * Read the turn as it is produced instead of waiting for it. The mount answers
   * in the AI SDK UI Message Stream vocabulary; `subscribe()` hands those chunks
   * to a UI, and the resolved {@link LlmResponse} is identical either way.
   */
  stream?: boolean;
}

/** The protocol's own chunk type, so a Janux stream lines up structurally with any AI SDK renderer. */
export type { UIMessageChunk };

export type ChunkListener = (chunk: UIMessageChunk) => void;

export interface StreamingLlm extends Llm {
  /** Listen to the chunks of every turn this Llm runs. Returns an unsubscribe. */
  subscribe(listener: ChunkListener): () => void;
}

function accumulate(chunk: UIMessageChunk, text: string[], toolCalls: any[]): void {
  if (chunk.type === 'text-delta') text.push(chunk.delta ?? '');
  if (chunk.type === 'error') throw new Error(chunk.errorText ?? 'llm stream error');
  if (chunk.type === 'tool-input-available') {
    toolCalls.push({ id: chunk.toolCallId, name: chunk.toolName, arguments: chunk.input ?? {} });
  }
}

async function readTurn(body: ReadableStream<Uint8Array>, emit: ChunkListener): Promise<LlmResponse> {
  const text: string[] = [];
  const toolCalls: any[] = [];

  for await (const payload of sseData(body)) {
    const chunk = JSON.parse(payload) as UIMessageChunk;

    // `accumulate` throws on an error chunk, and the thrown turn is what the
    // run reports — forwarding it as well would surface the same failure twice.
    accumulate(chunk, text, toolCalls);
    emit(chunk);
  }

  return { text: text.join(''), toolCalls };
}

/**
 * The mount says why it refused — the setup card names the variable to set, the
 * gate says it rate-limited you. Throwing the status code instead would discard
 * the one message written to be read by a human.
 */
async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => undefined)) as any;

  return new Error(body?.message ?? body?.error ?? `janux: /_janux/llm returned ${response.status}`);
}

/** `createRemoteLlm` throws bare status codes — failing here first keeps the mount's words in both modes. */
async function fetchOrFailure(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.ok) throw await failure(response);

  return response;
}

async function streamedTurn(
  options: ServerLlmOptions,
  request: LlmRequest,
  emit: ChunkListener,
): Promise<LlmResponse> {
  const response = await fetch(options.endpoint ?? '/_janux/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...options.headers },
    body: JSON.stringify({ messages: request.messages, tools: request.tools, stream: true }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) throw await failure(response);

  return readTurn(response.body, emit);
}

/**
 * An {@link Llm} backed by the app's server (`/_janux/llm`), where the model
 * and API keys resolve exactly like `defineAgent()`. Same browser-side loop,
 * different brain.
 */
export function serverLlm(options: ServerLlmOptions = {}): StreamingLlm {
  const listeners = new Set<ChunkListener>();
  const emit = (chunk: UIMessageChunk): void => listeners.forEach((listener) => listener(chunk));
  // Only built when it is the path actually taken.
  let remote: Llm | undefined;
  const oneShot = (request: LlmRequest): Promise<LlmResponse> => {
    remote ??= createRemoteLlm({
      api: options.endpoint ?? '/_janux/llm',
      headers: options.headers,
      fetch: fetchOrFailure as typeof fetch,
    });

    return remote(request);
  };
  const llm = ((request: LlmRequest) =>
    options.stream ? streamedTurn(options, request, emit) : oneShot(request)) as StreamingLlm;

  llm.subscribe = (listener) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  };

  return llm;
}
