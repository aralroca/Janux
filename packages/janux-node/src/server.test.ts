import { afterAll, describe, expect, it } from 'bun:test';
import { createNodeServer, type NodeServer } from './server';

/**
 * The listener `@janux/node` puts in front of an app: what `Bun.serve` is on
 * every other target, assembled out of `node:http`.
 *
 * The order it composes things in is the whole contract. Static assets answer
 * before the app, because a built file must never cost a render; an upgrade on
 * a path the app does not claim is destroyed rather than ignored, because Node
 * only cleans those up while the server has no 'upgrade' listener at all — and
 * attaching one made that this module's job.
 */

const servers: NodeServer[] = [];

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
});

/** A server on an OS-assigned port, closed when the suite ends. */
async function serve(options: Parameters<typeof createNodeServer>[0]): Promise<NodeServer> {
  const server = await createNodeServer({ port: 0, ...options });

  servers.push(server);

  return server;
}

const app = { fetch: async () => new Response('from the app') };

describe('createNodeServer', () => {
  it('asks the OS for a port and reports the one it got', async () => {
    const server = await serve({ handler: app });

    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://localhost:${server.port}`);
    expect(await (await fetch(server.url)).text()).toBe('from the app');
  });

  it('serves a built asset before the app ever renders', async () => {
    let rendered = 0;
    const server = await serve({
      handler: { fetch: async () => new Response(String((rendered += 1))) },
      staticResponse: async (request) =>
        new URL(request.url).pathname === '/client.js' ? new Response('bundle') : undefined,
    });

    expect(await (await fetch(`${server.url}/client.js`)).text()).toBe('bundle');
    expect(rendered).toBe(0);
  });

  it('falls back to the app for a path the static handler does not claim', async () => {
    const server = await serve({ handler: app, staticResponse: async () => undefined });

    expect(await (await fetch(`${server.url}/orders`)).text()).toBe('from the app');
  });

  it('carries the request through to the app unchanged', async () => {
    const server = await serve({
      handler: {
        fetch: async (request) =>
          Response.json({ method: request.method, path: new URL(request.url).pathname, body: await request.text() }),
      },
    });
    const response = await fetch(`${server.url}/orders?page=2`, { method: 'POST', body: 'payload' });

    expect(await response.json()).toEqual({ method: 'POST', path: '/orders', body: 'payload' });
  });

  /**
   * Closing has to hand the port back, which is the half both runtimes must
   * agree on. They do not agree on the callback: Bun's `node:http` shim reports
   * `ERR_SERVER_NOT_RUNNING` because `closeAllConnections()` has already torn
   * the listener down, where real Node closes cleanly — so the observable
   * result is what this asserts, not the error object.
   */
  it('hands the port back when it closes', async () => {
    const first = await createNodeServer({ handler: app, port: 0 });
    const { port, url } = first;

    await first.close().catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ERR_SERVER_NOT_RUNNING') throw error;
    });
    expect(await fetch(url).then(() => 'answered', () => 'refused')).toBe('refused');

    const second = await serve({ handler: app, port });

    expect(second.port).toBe(port);
  });

  /**
   * Two servers on the same port is a deployment that half-started. The listen
   * error has to reject the promise rather than be swallowed by a listener left
   * attached after binding — whatever each runtime words it as.
   */
  it('reports a port it could not bind instead of resolving anyway', async () => {
    const first = await serve({ handler: app });

    expect(await createNodeServer({ handler: app, port: first.port }).then(() => 'bound', () => 'rejected')).toBe(
      'rejected',
    );
  });
});
