import type { QueryClient } from './cache';

/** One chunk of the SSR query payload: what resolved, and what is still coming. */
export interface QueryPayload {
  entries?: Record<string, any>;
  expect?: string[];
}

/**
 * The server pushes payload chunks onto `window.__JANUX_QUERY__` as they
 * resolve. A plain array is what makes the timing work in both directions: the
 * chunks that land before the runtime loads queue up in it, and the ones that
 * land after go straight through, because draining replaces `push` with a
 * function that applies them.
 *
 * The same trick TanStack's streamed hydration uses, and for the same reason —
 * there is no other way to receive data that arrives mid-parse without watching
 * the DOM.
 */
type PayloadSink = QueryPayload[] & { push: (...payloads: QueryPayload[]) => number };

function apply(client: QueryClient, payload: QueryPayload): void {
  if (payload.expect?.length) client.expect(payload.expect);
  if (payload.entries) client.hydrate(payload.entries);
}

/**
 * Anything still expected when the document finishes is not coming — the
 * response ended, or failed mid-stream. Releasing lets those queries fetch, so
 * a broken stream costs a request rather than an island that never resolves.
 */
function releaseOnDocumentEnd(client: QueryClient): void {
  if (document.readyState === 'complete') {
    client.releaseExpected();

    return;
  }
  window.addEventListener('load', () => client.releaseExpected(), { once: true });
}

/**
 * Drains the payload chunks already queued and applies every later one as it
 * lands. `getQueryClient()` runs this on the first browser client, so hydration
 * ships with the query module — an app with no queries carries none of it.
 */
export function hydrateQueries(client: QueryClient): void {
  const queued: QueryPayload[] = (window as any).__JANUX_QUERY__ ?? [];
  const sink = [] as unknown as PayloadSink;

  sink.push = (...payloads: QueryPayload[]) => {
    payloads.forEach((payload) => apply(client, payload));

    return 0;
  };
  (window as any).__JANUX_QUERY__ = sink;
  queued.forEach((payload) => apply(client, payload));
  releaseOnDocumentEnd(client);
}
