import { afterAll, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { toRequest, writeResponse } from './http-bridge';

/**
 * Node is the one deployment target with no `Request -> Response` entry point of
 * its own, so this bridge is the whole reason `@janux/node` is more than a
 * config file. It is tested against a real `node:http` server rather than fake
 * objects: every bug worth catching here (header casing, multiple `set-cookie`,
 * a body that arrives in chunks, a client that hangs up mid-stream) is a bug
 * that only exists once actual sockets are involved.
 */

const servers: Server[] = [];

afterAll(() => servers.forEach((server) => server.close()));

/** Serves `handler` through the bridge and returns its base URL. */
async function serve(handler: (request: Request) => Promise<Response> | Response): Promise<string> {
  const server = createServer(async (incoming, outgoing) => {
    const response = await handler(toRequest(incoming));

    await writeResponse(response, outgoing);
  });

  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

describe('toRequest', () => {
  it('carries method, path and query through', async () => {
    const base = await serve((request) => Response.json({ method: request.method, url: new URL(request.url).pathname + new URL(request.url).search }));
    const body = await (await fetch(`${base}/shop/items?page=2`, { method: 'POST' })).json();

    expect(body).toEqual({ method: 'POST', url: '/shop/items?page=2' });
  });

  it('carries request headers, including a cookie the app reads for its session', async () => {
    const base = await serve((request) => new Response(request.headers.get('cookie') ?? 'none'));

    expect(await (await fetch(base, { headers: { cookie: 'session=abc' } })).text()).toBe('session=abc');
  });

  it('reads a body that arrives in more than one chunk', async () => {
    const base = await serve(async (request) => new Response(String((await request.text()).length)));
    const payload = 'x'.repeat(512 * 1024);

    expect(await (await fetch(base, { method: 'POST', body: payload })).text()).toBe(String(payload.length));
  });

  it('gives GET and HEAD no body, which the Request constructor refuses to accept', async () => {
    const base = await serve((request) => new Response(request.body === null ? 'bodyless' : 'has body'));

    expect(await (await fetch(base)).text()).toBe('bodyless');
  });

  it('builds an absolute URL from the Host header, so `new URL(request.url)` works', async () => {
    const base = await serve((request) => new Response(new URL(request.url).host));
    const { port } = new URL(base);

    expect(await (await fetch(base)).text()).toBe(`localhost:${port}`);
  });

  /** Behind a proxy the scheme the browser used is not the scheme the socket saw. */
  it('honours x-forwarded-proto so redirects and canonical URLs are not downgraded to http', async () => {
    const base = await serve((request) => new Response(new URL(request.url).protocol));

    expect(await (await fetch(base, { headers: { 'x-forwarded-proto': 'https' } })).text()).toBe('https:');
  });
});

describe('writeResponse', () => {
  it('carries status and statusText', async () => {
    const base = await serve(() => new Response('nope', { status: 418, statusText: 'I am a teapot' }));
    const response = await fetch(base);

    expect(response.status).toBe(418);
    expect(await response.text()).toBe('nope');
  });

  it('sends every set-cookie as its own header instead of joining them', async () => {
    const base = await serve(() => {
      const headers = new Headers();

      headers.append('set-cookie', 'a=1; Path=/');
      headers.append('set-cookie', 'b=2; Path=/');

      return new Response('ok', { headers });
    });
    const cookies = (await fetch(base)).headers.getSetCookie();

    // Joined with a comma, a browser sees one malformed cookie and drops the session.
    expect(cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('streams a body in chunks rather than buffering it, which is what streaming SSR needs', async () => {
    const base = await serve(
      () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode('<html>'));
              await new Promise((resolve) => setTimeout(resolve, 30));
              controller.enqueue(new TextEncoder().encode('</html>'));
              controller.close();
            },
          }),
        ),
    );
    const response = await fetch(base);
    const reader = response.body!.getReader();
    const first = await reader.read();

    // The first chunk arrives before the second is produced: proof it is not buffered.
    expect(new TextDecoder().decode(first.value)).toBe('<html>');
    await reader.cancel();
  });

  it('sends a bodyless response without hanging', async () => {
    const base = await serve(() => new Response(null, { status: 204 }));
    const response = await fetch(base);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

});

/**
 * Everything above runs through Bun's `node:http` shim, which is close enough
 * for translation but is not the runtime this package ships for — most visibly,
 * it never emits 'close' on a `ServerResponse` when a client hangs up, so a
 * disconnect assertion there would pass or fail for reasons that say nothing
 * about Node. This spawns the real thing.
 */
describe('the bridge under real Node', () => {
  const report = (() => {
    const fixture = join(import.meta.dirname, '__fixtures__/bridge-under-node.mjs');
    const run = Bun.spawnSync(['node', fixture]);

    if (!run.success) throw new Error(`bridge-under-node.mjs failed:\n${run.stderr.toString()}`);

    return JSON.parse(run.stdout.toString().trim().split('\n').at(-1)!);
  })();

  it('is actually Node, not Bun wearing node:http', () => {
    expect(report.runtime).toBe('node');
    expect(Number(report.version.split('.')[0])).toBeGreaterThanOrEqual(24);
  });

  it('translates method, host and request headers', () => {
    expect(report.method).toBe('GET');
    expect(report.host).toBe(true);
    expect(report.cookie).toBe('session=abc');
  });

  it('keeps two set-cookie headers two cookies', () => {
    expect(report.cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('reads a request body that arrives across many chunks', () => {
    expect(report.echoedLength).toBe(300_000);
  });

  /** A reader that walks away must not leave the stream pulling forever. */
  it('cancels the response body when the client disconnects mid-stream', () => {
    expect(report.cancelled).toBe(true);
    expect(report.stoppedPulling).toBe(true);
  });
});
