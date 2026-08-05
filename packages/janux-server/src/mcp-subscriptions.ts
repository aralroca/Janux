/**
 * `subscriptions/listen` (2026-07-28): the long-lived stream that replaced
 * `resources/subscribe` and the HTTP GET endpoint — the one Janux answers with
 * 405 because a stateless server has no server-initiated channel to offer.
 *
 * This one costs no state: the subscription lives exactly as long as the POST
 * that opened it, so there is nothing to store, nothing to affinity-route and
 * nothing to expire. What it carries is the signal the server actually has —
 * `revalidatePath()` marking a page's cached response stale, which is precisely
 * "the projection of that page changed".
 *
 * The watch is released when the stream ends, whichever way it ends. A dropped
 * agent that left its closure behind would be a leak with no upper bound.
 */

const META = 'io.modelcontextprotocol/';
const PAGE_URI = 'janux://page';

export interface SubscriptionDeps {
  /** Registers an invalidation watcher and hands back the release. */
  watch(listener: (key: string) => void): () => void;
}

interface ListenRequest {
  id?: number | string | null;
  params?: { notifications?: { resourceSubscriptions?: unknown } };
}

/** The filter, narrowed to what this server can honestly promise. */
function honored(rpc: ListenRequest): string[] {
  const asked = rpc.params?.notifications?.resourceSubscriptions;

  return Array.isArray(asked) ? asked.filter((uri): uri is string => typeof uri === 'string') : [];
}

const frame = (message: unknown): string => `data: ${JSON.stringify(message)}\n\n`;

function notification(method: string, id: ListenRequest['id'], params: Record<string, unknown> = {}): string {
  return frame({ jsonrpc: '2.0', method, params: { ...params, _meta: { [`${META}subscriptionId`]: id ?? null } } });
}

/**
 * Which resource an invalidation key is about. `path:/orders` is the page whose
 * response was dropped; a bare tag names no single resource, so it notifies
 * nothing rather than guessing.
 */
function uriFor(key: string): string | undefined {
  return key.startsWith('path:') ? `${PAGE_URI}${key.slice('path:'.length)}` : undefined;
}

export function listenStream(rpc: ListenRequest, deps: SubscriptionDeps): Response {
  const uris = honored(rpc);
  const encoder = new TextEncoder();
  let release = (): void => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      // MUST be the first message on the stream, and MUST reflect only what
      // this server agreed to deliver.
      send(notification('notifications/subscriptions/acknowledged', rpc.id, { notifications: { resourceSubscriptions: uris } }));
      release = deps.watch((key) => {
        const uri = uriFor(key);

        if (uri && uris.includes(uri)) send(notification('notifications/resources/updated', rpc.id, { uri }));
      });
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' },
  });
}
