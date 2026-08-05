import type { ProviderReply } from './providers';
import type { ProviderStreamEvent } from './provider-stream';
import type { StreamFrame } from './harness/resumable';
import { sseFrame } from './sse';

/**
 * `/_janux/llm` streams in the **AI SDK UI Message Stream** vocabulary (v1)
 * rather than a Janux-shaped one. It costs the same to emit and it means any
 * client that already speaks it — `useChat`, AI Elements, the AI DevTools —
 * can read a Janux turn without a translator. Janux emits the subset one model
 * turn can produce: the tool *outputs* are not here because they happen in the
 * page, and the browser loop appends them (see `copilot.stream()`).
 */
const HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'x-vercel-ai-ui-message-stream': 'v1',
  // Proxies that buffer would hold the whole turn and hand it over at the end.
  'x-accel-buffering': 'no',
};

const DONE = 'data: [DONE]\n\n';
const TEXT_ID = 't0';

function mapEvent(event: ProviderStreamEvent): unknown {
  if (event.type === 'text') return { type: 'text-delta', id: TEXT_ID, delta: event.delta };
  if (event.type === 'tool-start') return { type: 'tool-input-start', toolCallId: event.id, toolName: event.name };

  return { type: 'tool-input-delta', toolCallId: event.id, inputTextDelta: event.delta };
}

type Turn = AsyncGenerator<ProviderStreamEvent, ProviderReply>;

/**
 * `text-start` must precede every `text-delta`, or a conforming client throws.
 *
 * Driven with `next()` because the return value is the turn's reply, so the
 * early-completion path has to be closed by hand: a reader that walks away
 * (browser tab closed mid-answer) would otherwise leave the provider generator
 * parked in its SSE loop forever.
 */
async function* deltaChunks(turn: Turn): AsyncGenerator<unknown, { reply: ProviderReply; textOpen: boolean }> {
  let textOpen = false;
  let next = await turn.next();

  try {
    while (!next.done) {
      if (next.value.type === 'text' && !textOpen) {
        textOpen = true;
        yield { type: 'text-start', id: TEXT_ID };
      }
      yield mapEvent(next.value);
      next = await turn.next();
    }
  } finally {
    if (!next.done) await turn.return(undefined as never).catch(() => undefined);
  }

  return { reply: next.value, textOpen };
}

/** A provider that answers whole still owes the reader the same chunk shapes. */
function* wholeText(text: string): Generator<unknown> {
  yield { type: 'text-start', id: TEXT_ID };
  yield { type: 'text-delta', id: TEXT_ID, delta: text };
}

/** The assembled calls, once their arguments are complete and parsed. */
function toolInputs(reply: ProviderReply): unknown[] {
  return reply.toolCalls.map((call) => ({
    type: 'tool-input-available',
    toolCallId: call.id,
    toolName: call.name,
    input: call.input,
  }));
}

export async function* turnChunks(turn: Turn): AsyncGenerator<unknown> {
  yield { type: 'start' };
  yield { type: 'start-step' };
  const { reply, textOpen } = yield* deltaChunks(turn);

  if (!textOpen && reply.text) yield* wholeText(reply.text);
  if (textOpen || reply.text) yield { type: 'text-end', id: TEXT_ID };
  yield* toolInputs(reply);
  yield { type: 'finish-step' };
  yield { type: 'finish' };
}

/**
 * Where a turn is retained so it can be replayed. Present only when the app
 * opted into resumable streams; its absence is what keeps the default cheap.
 */
export interface StreamSink {
  append(frame: StreamFrame): void;
  close(): void;
}

/** Numbers the chunks once, so the live wire and the retained log agree on ids. */
async function* numbered(chunks: AsyncGenerator<unknown>): AsyncGenerator<StreamFrame> {
  let id = 0;

  for await (const chunk of chunks) yield { id: id++, chunk };
}

async function pump(
  frames: AsyncGenerator<StreamFrame>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  gone: () => boolean,
  sink: StreamSink | undefined,
): Promise<void> {
  const encoder = new TextEncoder();
  // Enqueueing to a cancelled stream throws, and the tail below still has to run
  // for the live case — so writes are attempts, not assumptions.
  const write = (frame: StreamFrame): void => {
    sink?.append(frame);
    try {
      if (!gone()) controller.enqueue(encoder.encode(sseFrame(frame.chunk, frame.id)));
    } catch {
      // The reader is gone; nothing left to say.
    }
  };
  let last = -1;

  try {
    for await (const frame of frames) {
      // Without a sink a departed reader ends the turn — nobody is left to bill
      // it for. With one, the turn is exactly what a resume comes back for, so
      // it runs to the end and the log, not the socket, is the destination.
      if (gone() && !sink) break;
      write(frame);
      last = frame.id;
    }
  } catch (error) {
    // A provider that dies mid-turn still owes the client a terminated stream.
    write({ id: last + 1, chunk: { type: 'error', errorText: String(error) } });
  }
  sink?.close();
  if (gone()) return;
  try {
    controller.enqueue(encoder.encode(DONE));
    controller.close();
  } catch {
    // Raced with a cancel between the check and here.
  }
}

/**
 * Every event carries an incremental `id:`, and the response its stream id —
 * which is the whole cursor protocol: a reader that comes back names the last
 * id it saw and {@link replayResponse} owes it the remainder. With no `sink`
 * the ids are still emitted and nothing is retained, exactly as before.
 */
export function streamingResponse(chunks: AsyncGenerator<unknown>, streamId: string, sink?: StreamSink): Response {
  const frames = numbered(chunks);
  let gone = false;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => pump(frames, controller, () => gone, sink),
    // A disconnected reader has to reach the provider, or the turn keeps
    // generating (and billing) for nobody — unless it is being retained, in
    // which case finishing it is the point.
    cancel() {
      gone = true;

      return sink ? undefined : frames.return(undefined).then(() => undefined);
    },
  });

  return new Response(body, { headers: { ...HEADERS, 'x-janux-stream-id': streamId } });
}

/** The same wire, re-emitted from the log: original ids, so a reader cannot double-count. */
export function replayResponse(frames: AsyncGenerator<StreamFrame>, streamId: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const frame of frames) controller.enqueue(encoder.encode(sseFrame(frame.chunk, frame.id)));
      controller.enqueue(encoder.encode(DONE));
      controller.close();
    },
    cancel: () => frames.return(undefined).then(() => undefined),
  });

  return new Response(body, { headers: { ...HEADERS, 'x-janux-stream-id': streamId } });
}
