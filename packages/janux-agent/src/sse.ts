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

/** The `data:` payloads of an SSE body, in order, stopping at the `[DONE]` sentinel. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of lines(body)) {
    const payload = line.startsWith('data:') ? line.slice(5).trim() : '';

    if (payload === '[DONE]') return;
    if (payload) yield payload;
  }
}

/** SSE frame for one already-serialized chunk. */
export function sseFrame(data: unknown, id?: number): string {
  const prefix = id === undefined ? '' : `id: ${id}\n`;

  return `${prefix}data: ${JSON.stringify(data)}\n\n`;
}
