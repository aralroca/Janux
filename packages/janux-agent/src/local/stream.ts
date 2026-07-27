import type { AgentStep, Llm } from '@aralroca/gui-agent';
import type { ChunkListener, StreamingLlm, UIMessageChunk } from './llm';

/**
 * The browser loop, spoken as an AI SDK UI Message Stream.
 *
 * The server streams the part of a turn it owns (text and tool *inputs*); the
 * tool *outputs* only exist here, because the tools run in the page. Merging
 * both is what makes a client-side agent loop readable by any renderer that
 * already speaks the protocol, instead of by this app only.
 */
export interface RunStreamOptions {
  llm: Llm;
  /** Runs the loop; resolves with the final answer when the agent is done. */
  run: () => Promise<{ text: string }>;
  /** Subscribes to the loop's steps for the duration of the run. */
  listen: (listener: (step: AgentStep) => void) => () => void;
  signal?: AbortSignal;
}

function subscribeToLlm(llm: Llm, listener: ChunkListener): () => void {
  const streaming = llm as StreamingLlm;

  // A local model has no wire to stream: its turns land whole, and the loop's
  // steps still describe them.
  return typeof streaming.subscribe === 'function' ? streaming.subscribe(listener) : () => undefined;
}

/** A turn that never streamed still owes the reader its answer, in the same shape. */
function pushWholeText(text: string, push: (chunk: UIMessageChunk) => void): void {
  push({ type: 'text-start', id: 't0' });
  push({ type: 'text-delta', id: 't0', delta: text });
  push({ type: 'text-end', id: 't0' });
}

/** One step per model turn: the server's envelope is re-cut around the tool outputs. */
function createComposer(push: (chunk: UIMessageChunk) => void) {
  let stepOpen = false;
  let streamedText = false;

  return {
    fromLlm(chunk: UIMessageChunk): void {
      if (chunk.type === 'start' || chunk.type === 'finish' || chunk.type === 'finish-step') return;
      if (chunk.type === 'start-step' && stepOpen) push({ type: 'finish-step' });
      stepOpen ||= chunk.type === 'start-step';
      streamedText ||= chunk.type === 'text-delta';
      push(chunk);
    },
    fromStep(step: AgentStep): void {
      if (step.type === 'tool-result') {
        push({ type: 'tool-output-available', toolCallId: step.call.id, output: step.result });
      }
      if (step.type === 'tool-denied') push({ type: 'tool-output-denied', toolCallId: step.call.id });
    },
    close(text: string | undefined): void {
      if (stepOpen) push({ type: 'finish-step' });
      if (!streamedText && text) pushWholeText(text, push);
      push({ type: 'finish' });
    },
  };
}

function endWith(error: unknown, signal: AbortSignal | undefined, push: (chunk: UIMessageChunk) => void): void {
  push(signal?.aborted ? { type: 'abort' } : { type: 'error', errorText: String(error) });
}

function drive(options: RunStreamOptions, controller: ReadableStreamDefaultController<UIMessageChunk>): void {
  const push = (chunk: UIMessageChunk): void => controller.enqueue(chunk);
  const composer = createComposer(push);
  const stopChunks = subscribeToLlm(options.llm, composer.fromLlm);
  const stopSteps = options.listen(composer.fromStep);

  push({ type: 'start' });
  options
    .run()
    .then((result) => composer.close(result.text))
    .catch((error: unknown) => endWith(error, options.signal, push))
    .finally(() => {
      stopChunks();
      stopSteps();
      controller.close();
    });
}

export function runStream(options: RunStreamOptions): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({ start: (controller) => drive(options, controller) });
}
