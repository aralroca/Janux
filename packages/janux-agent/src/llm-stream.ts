import type { ProviderReply } from './providers';
import type { ProviderStreamEvent } from './provider-stream';
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

async function pump(
  chunks: AsyncGenerator<unknown>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  gone: () => boolean,
): Promise<void> {
  const encoder = new TextEncoder();
  let id = 0;
  // Enqueueing to a cancelled stream throws, and the tail below still has to run
  // for the live case — so writes are attempts, not assumptions.
  const write = (chunk: unknown): void => {
    try {
      controller.enqueue(encoder.encode(sseFrame(chunk, id++)));
    } catch {
      // The reader is gone; nothing left to say.
    }
  };

  try {
    for await (const chunk of chunks) {
      // `break` (not `return`) so the for-await closes the generator on the way
      // out, which is what reaches the provider.
      if (gone()) break;
      write(chunk);
    }
  } catch (error) {
    // A provider that dies mid-turn still owes the client a terminated stream.
    write({ type: 'error', errorText: String(error) });
  }
  if (gone()) return;
  try {
    controller.enqueue(encoder.encode(DONE));
    controller.close();
  } catch {
    // Raced with a cancel between the check and here.
  }
}

/**
 * Every event carries an incremental `id:`, and the response its stream id.
 * Nothing replays them yet — that needs a durable buffer the app has to own —
 * but a resumable transport can be added behind this shape without moving the
 * wire, which is why the ids are here from the start.
 */
export function streamingResponse(chunks: AsyncGenerator<unknown>, streamId: string): Response {
  let gone = false;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => pump(chunks, controller, () => gone),
    // A disconnected reader has to reach the provider, or the turn keeps
    // generating (and billing) for nobody.
    cancel() {
      gone = true;

      return chunks.return(undefined).then(() => undefined);
    },
  });

  return new Response(body, { headers: { ...HEADERS, 'x-janux-stream-id': streamId } });
}
