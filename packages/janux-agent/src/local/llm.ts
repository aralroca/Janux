import { createAiSdkLlm, createRemoteLlm } from '@aralroca/gui-agent/ai-sdk';
import type { Llm, LlmRequest, LlmResponse } from '@aralroca/gui-agent';
import type { UIMessageChunk } from 'ai';
import { sseEvents } from '../sse';
import {
  createResumeSession,
  forgetInterrupted,
  interruptedStream,
  resumeRequest,
  type ResumeOptions,
  type ResumeSession,
} from './resume';

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

function usableAdapter(gpu: any, timeoutMs: number): Promise<{ usable: boolean; timedOut: boolean }> {
  const adapter = Promise.resolve()
    .then(() => gpu.requestAdapter?.())
    .then((value: unknown) => ({ usable: Boolean(value), timedOut: false }), () => ({ usable: false, timedOut: false }));
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ usable: boolean; timedOut: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ usable: false, timedOut: true }), timeoutMs);
  });

  return Promise.race([adapter, timeout]).finally(() => clearTimeout(timer));
}

/** Whether this browser can *actually* run the local model: a real `requestAdapter()` probe, cached. */
export function probeLocalLlm({ timeoutMs = PROBE_TIMEOUT_MS }: ProbeOptions = {}): Promise<boolean> {
  const gpu = supportsLocalLlm() ? (navigator as any).gpu : undefined;

  if (!gpu) return Promise.resolve(false);
  const cached = probes.get(gpu);

  if (cached) return cached;
  // A timeout is "too slow to answer within THIS budget", not a verdict: a cold
  // GPU must not be written off for the page's lifetime, so only real answers
  // are cached — a later probe with a longer budget can still find it usable.
  const probe = usableAdapter(gpu, timeoutMs).then((result) => {
    if (result.timedOut) probes.delete(gpu);

    return result.usable;
  });

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

/** A closed reasoning block: the model thinking out loud, not part of the answer. */
const REASONING_BLOCK = /<think>[\s\S]*?<\/think>/g;
/** Chat-template control tokens (`<|im_end|>`, `<|eot_id|>`, …) — never prose. */
const TEMPLATE_MARKER = /<\|[^|]*\|>/g;

/**
 * What the model meant to say. Chat-template models emit their reasoning and
 * turn terminators as literal text, so a UI rendering the answer verbatim shows
 * the stage directions too. Only closed blocks and `<|…|>` tokens go: a bare
 * `<think>` a user actually typed about survives.
 */
function answerOf(text: string): string {
  return text.replace(REASONING_BLOCK, '').replace(TEMPLATE_MARKER, '').trim();
}

async function createSession(options: LocalLlmOptions, onProgress?: (fraction: number) => void): Promise<Llm> {
  const { transformersJS } = options.provider ?? (await importProvider());
  const model = transformersJS(options.modelId ?? DEFAULT_LOCAL_MODEL, {
    device: options.device ?? 'webgpu',
    dtype: options.dtype ?? 'q4f16',
    ...(options.worker ? { worker: options.worker } : {}),
  });

  await model.createSessionWithProgress((fraction: number) => onProgress?.(fraction));
  const llm = createAiSdkLlm({ model: model as any, settings: options.settings });

  return async (request) => {
    const reply = await llm(request);

    return { ...reply, text: answerOf(reply.text ?? '') };
  };
}

/**
 * An {@link Llm} backed by an open-source model running in the visitor's
 * browser (Transformers.js over WebGPU). The model downloads lazily — call
 * `load()` first to control when (and show progress).
 */
export function localLlm(options: LocalLlmOptions = {}): LocalLlm {
  let session: Promise<Llm> | undefined;

  // A failed download must not poison the cache: `??=` never clears a rejected
  // promise, so every later attempt would rethrow the same stale error and no
  // retry button could ever work.
  const ensure = (onProgress?: (fraction: number) => void): Promise<Llm> =>
    (session ??= createSession(options, onProgress).catch((error) => {
      session = undefined;
      throw error;
    }));
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
  /**
   * Survive losing the connection mid-turn. A dropped network reconnects and
   * continues; a reload or a second tab picks the turn up through
   * {@link StreamingLlm.resumeInterrupted}. Requires `harness.resumableStreams`
   * on the agent — without it the mount has nothing to replay.
   */
  resume?: boolean | ResumeOptions;
}

/** The protocol's own chunk type, so a Janux stream lines up structurally with any AI SDK renderer. */
export type { UIMessageChunk };

export type ChunkListener = (chunk: UIMessageChunk) => void;

export interface StreamingLlm extends Llm {
  /** Listen to the chunks of every turn this Llm runs. Returns an unsubscribe. */
  subscribe(listener: ChunkListener): () => void;
  /**
   * The turn a reload (or another tab) interrupted, replayed from the start
   * through `subscribe` and resolved when it ends. `undefined` when there is
   * nothing in flight — which is the answer on almost every page load.
   */
  resumeInterrupted(): Promise<LlmResponse | undefined>;
}

/** One turn being assembled, across however many transports it takes. */
interface Turn {
  text: string[];
  toolCalls: any[];
  /** The turn reached its own end — as opposed to the connection reaching one. */
  finished: boolean;
}

const newTurn = (): Turn => ({ text: [], toolCalls: [], finished: false });

const replyOf = (turn: Turn): LlmResponse => ({ text: turn.text.join(''), toolCalls: turn.toolCalls });

function accumulate(chunk: UIMessageChunk, turn: Turn): void {
  if (chunk.type === 'text-delta') turn.text.push(chunk.delta ?? '');
  if (chunk.type === 'finish') turn.finished = true;
  if (chunk.type === 'error') {
    // The turn's own failure, not a transport hiccup: reconnecting would only
    // fetch the same error again.
    turn.finished = true;
    throw new Error(chunk.errorText ?? 'llm stream error');
  }
  if (chunk.type === 'tool-input-available') {
    turn.toolCalls.push({ id: chunk.toolCallId, name: chunk.toolName, arguments: chunk.input ?? {} });
  }
}

async function readInto(
  body: ReadableStream<Uint8Array>,
  emit: ChunkListener,
  turn: Turn,
  session?: ResumeSession,
): Promise<void> {
  for await (const event of sseEvents(body)) {
    const chunk = JSON.parse(event.data) as UIMessageChunk;

    if (session && !session.accepts(event.id)) continue;
    // `accumulate` throws on an error chunk, and the thrown turn is what the
    // run reports — forwarding it as well would surface the same failure twice.
    accumulate(chunk, turn);
    emit(chunk);
    session?.advance(event.id);
  }
}

async function readTurn(body: ReadableStream<Uint8Array>, emit: ChunkListener): Promise<LlmResponse> {
  const turn = newTurn();

  await readInto(body, emit, turn);

  return replyOf(turn);
}

/**
 * Reads a turn across transports: when the connection ends before the turn does,
 * the same turn is picked back up where it stopped. A body that simply *stops*
 * is the common case (a dropped network is not an exception on this side), which
 * is why completion is judged by the protocol's own `finish` and never by the
 * socket closing.
 */
async function readResumable(first: Response, emit: ChunkListener, session: ResumeSession): Promise<LlmResponse> {
  const turn = newTurn();
  let response: Response | undefined = first;
  let failure: unknown;

  session.begin(first.headers.get('x-janux-stream-id'));
  while (response && !turn.finished) {
    failure = await readInto(response.body!, emit, turn, session).then(() => undefined, (error) => error);
    response = turn.finished ? undefined : await session.reconnect();
  }
  session.finish();
  if (failure) throw failure;

  return replyOf(turn);
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

const endpointOf = (options: ServerLlmOptions): string => options.endpoint ?? '/_janux/llm';

const resumeOptions = (options: ServerLlmOptions): ResumeOptions | undefined =>
  options.resume ? (options.resume === true ? {} : options.resume) : undefined;

async function streamedTurn(
  options: ServerLlmOptions,
  request: LlmRequest,
  emit: ChunkListener,
): Promise<LlmResponse> {
  const resuming = resumeOptions(options);
  const response = await fetch(endpointOf(options), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...options.headers },
    body: JSON.stringify({ messages: request.messages, tools: request.tools, stream: true }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) throw await failure(response);
  if (!resuming) return readTurn(response.body, emit);

  return readResumable(response, emit, createResumeSession(endpointOf(options), options.headers, resuming));
}

/**
 * Picks up a turn a previous page load left in flight, replayed from the very
 * beginning — after a reload there is no text on the screen to continue from,
 * so continuing means repainting the whole answer.
 */
async function resumeInterruptedTurn(options: ServerLlmOptions, emit: ChunkListener): Promise<LlmResponse | undefined> {
  const resuming = resumeOptions(options);
  const streamId = resuming && interruptedStream(resuming);

  if (!resuming || !streamId) return undefined;
  const response = await resumeRequest(endpointOf(options), streamId, -1, options.headers).catch(() => undefined);

  // Expired, finished long ago or never ours: nothing to show, and nothing to
  // keep offering to the next page load either.
  if (!response?.ok || !response.body) {
    forgetInterrupted(resuming);

    return undefined;
  }

  return readResumable(response, emit, createResumeSession(endpointOf(options), options.headers, resuming));
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
  llm.resumeInterrupted = () => resumeInterruptedTurn(options, emit);

  return llm;
}
