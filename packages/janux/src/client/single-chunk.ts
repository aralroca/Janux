/**
 * Wraps already-buffered HTML into a one-chunk stream. Client navigation
 * fetches a complete, server-rendered page, so streaming buys nothing here —
 * and delivering it in a single chunk sidesteps the diff's chunk-boundary
 * edge cases entirely, making every navigation deterministic.
 */
export function singleChunkStream(html: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html));
      controller.close();
    },
  });
}
