import { describe, expect, it } from 'bun:test';
import { jsx } from 'janux';
import { createJanuxServer } from './server';
import { revalidatePath, revalidateTag } from './response-cache';
import { listenStream } from './mcp-subscriptions';

/**
 * `subscriptions/listen` (2026-07-28), which replaced `resources/subscribe` and
 * the GET stream Janux never offered.
 *
 * A subscription here lives exactly as long as the POST that opened it, so it
 * needs no session and no affinity — the stateless posture survives. What it
 * carries is the signal the server actually has: a page whose cached response
 * was invalidated is a page whose resource projection changed.
 */

const MODERN = '2026-07-28';
const META = 'io.modelcontextprotocol/';

function server() {
  return createJanuxServer({
    title: 'shop',
    routes: {
      '/': () => jsx('main', { children: 'Home' }),
      '/orders': () => jsx('main', { children: 'Orders' }),
    },
  });
}

function listen(target: ReturnType<typeof server>, notifications: unknown, era: 'modern' | 'legacy' = 'modern') {
  const params = {
    notifications,
    ...(era === 'modern' ? { _meta: { [`${META}protocolVersion`]: MODERN } } : {}),
  };

  return target.fetch(
    new Request('http://x/_janux/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(era === 'modern' ? { 'mcp-protocol-version': MODERN, 'mcp-method': 'subscriptions/listen' } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'subscriptions/listen', params }),
    }),
  );
}

/** Reads SSE frames until `count` messages arrived or the wait runs out. */
async function frames(res: Response, count: number, timeoutMs = 500): Promise<any[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const seen: any[] = [];
  const deadline = Date.now() + timeoutMs;
  let buffer = '';

  while (seen.length < count && Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), Bun.sleep(timeoutMs).then(() => undefined)]);

    if (!chunk || chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    buffer
      .split('\n\n')
      .slice(0, -1)
      .forEach((frame) => seen.push(JSON.parse(frame.replace(/^data: /, ''))));
    buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2);
  }
  await reader.cancel();

  return seen;
}

describe('MCP resource subscriptions', () => {
  it('acknowledges first, naming the subscription and what it agreed to honor', async () => {
    const res = await listen(server(), { resourceSubscriptions: ['janux://page/orders'] });

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const [ack] = await frames(res, 1);

    expect(ack.method).toBe('notifications/subscriptions/acknowledged');
    expect(ack.params._meta[`${META}subscriptionId`]).toBe(7);
    expect(ack.params.notifications).toEqual({ resourceSubscriptions: ['janux://page/orders'] });
  });

  it('says what it cannot do rather than promising it', async () => {
    const res = await listen(server(), { resourceSubscriptions: ['janux://page/orders'], toolsListChanged: true });
    const [ack] = await frames(res, 1);

    expect(ack.params.notifications.toolsListChanged).toBeUndefined();
  });

  it('delivers an update when the page behind the resource is revalidated', async () => {
    const res = await listen(server(), { resourceSubscriptions: ['janux://page/orders'] });
    const pending = frames(res, 2);

    await Bun.sleep(20);
    revalidatePath('/orders');
    const [, updated] = await pending;

    expect(updated.method).toBe('notifications/resources/updated');
    expect(updated.params.uri).toBe('janux://page/orders');
    expect(updated.params._meta[`${META}subscriptionId`]).toBe(7);
  });

  it('stays silent about a resource this client never asked for', async () => {
    const res = await listen(server(), { resourceSubscriptions: ['janux://page/orders'] });
    const pending = frames(res, 2, 200);

    await Bun.sleep(20);
    revalidatePath('/');
    revalidateTag('catalog');

    expect(await pending).toHaveLength(1);
  });

  it('is not a method the older era ever had', async () => {
    const res = await listen(server(), { resourceSubscriptions: ['janux://page/orders'] }, 'legacy');
    const body = await res.json();

    expect(body.error.code).toBe(-32601);
  });

  it('advertises subscribe to the era that has it, and to no other', async () => {
    const target = server();
    const modern = await target.fetch(
      new Request('http://x/_janux/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'mcp-protocol-version': MODERN, 'mcp-method': 'server/discover' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'server/discover',
          params: { _meta: { [`${META}protocolVersion`]: MODERN } },
        }),
      }),
    );
    const legacy = await target.fetch(
      new Request('http://x/_janux/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      }),
    );

    expect((await modern.json()).result.capabilities.resources.subscribe).toBe(true);
    expect((await legacy.json()).result.capabilities.resources).toEqual({});
  });
});

/**
 * The leak this feature is one careless line away from: a stream that ends
 * without releasing its watcher leaves the module-level emitter holding a
 * closure per dropped agent, forever.
 */
describe('MCP subscriptions: releasing the watch', () => {
  const fakeWatch = () => {
    const listeners = new Set<(key: string) => void>();

    return {
      count: () => listeners.size,
      watch: (listener: (key: string) => void) => {
        listeners.add(listener);

        return () => listeners.delete(listener);
      },
    };
  };

  const open = (deps: { watch: (listener: (key: string) => void) => () => void }) =>
    listenStream({ id: 7, params: { notifications: { resourceSubscriptions: ['janux://page/orders'] } } }, deps);

  it('lets go when the client cancels the stream', async () => {
    const emitter = fakeWatch();
    const res = open(emitter);

    expect(emitter.count()).toBe(1);
    await res.body!.cancel();

    expect(emitter.count()).toBe(0);
  });

  it('lets go when a subscription asked for nothing it can deliver', async () => {
    const emitter = fakeWatch();
    const res = listenStream({ id: 7, params: { notifications: {} } }, emitter);

    await res.body!.cancel();

    expect(emitter.count()).toBe(0);
  });
});
