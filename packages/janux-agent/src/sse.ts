/**
 * Shared by the provider stream (server) and `serverLlm({ stream })` (browser):
 * one wire, one reader. `getReader()` rather than `for await` because async
 * iteration of a `ReadableStream` is not everywhere yet (Safari).
 */

/**
 * Whole lines out of a byte stream: frames arrive split at arbitrary boundaries.
 *
 * The `finally` matters: `sseData` returns at the `[DONE]` sentinel, which ends
 * this generator mid-`yield` with the reader still locked. Without cancelling,
 * every streamed turn strands the provider's response body — and its socket —
 * until GC.
 */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      const parts = (buffer + (done ? '' : decoder.decode(value, { stream: true }))).split('\n');

      buffer = done ? '' : parts.pop() ?? '';
      yield* parts;
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export interface SseEvent {
  /** The `id:` that preceded this payload, or `-1` when the producer sent none. */
  id: number;
  data: string;
}

/**
 * The events of an SSE body, in order, stopping at the `[DONE]` sentinel.
 *
 * The `id:` is carried rather than dropped because it is the resume cursor: a
 * reader that comes back names the last one it saw and is owed only what follows.
 */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  let id = -1;

  for await (const line of lines(body)) {
    const payload = line.startsWith('data:') ? line.slice(5).trim() : '';

    // An unparseable id is "no id", not `NaN`: a cursor comparison against NaN
    // is false in both directions, which silently discards the frame.
    if (line.startsWith('id:')) id = Number.parseInt(line.slice(3).trim(), 10) || -1;
    if (payload === '[DONE]') return;
    if (payload) yield { id, data: payload };
  }
}

/** The `data:` payloads of an SSE body, in order, stopping at the `[DONE]` sentinel. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const event of sseEvents(body)) yield event.data;
}

/** SSE frame for one already-serialized chunk. */
export function sseFrame(data: unknown, id?: number): string {
  const prefix = id === undefined ? '' : `id: ${id}\n`;

  return `${prefix}data: ${JSON.stringify(data)}\n\n`;
}
