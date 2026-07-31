/**
 * The bridge, exercised by the runtime it exists for.
 *
 * `bun test` runs the rest of this package's suite through Bun's `node:http`
 * shim, which is close but not identical — most visibly, it never emits 'close'
 * on a `ServerResponse` when the client hangs up, so a disconnect test passing
 * or failing there says nothing about Node. This script runs under real `node`
 * and prints one JSON line the suite asserts against.
 */
import { createServer } from 'node:http';
import { toRequest, writeResponse } from '../http-bridge.ts';

const state = { pulled: 0, cancelled: false };

const server = createServer(async (incoming, outgoing) => {
  const request = toRequest(incoming);
  const { pathname } = new URL(request.url);

  await writeResponse(await handle(request, pathname), outgoing);
});

async function handle(request, pathname) {
  if (pathname === '/cookies') {
    const headers = new Headers();

    headers.append('set-cookie', 'a=1; Path=/');
    headers.append('set-cookie', 'b=2; Path=/');

    return new Response('ok', { headers });
  }

  if (pathname === '/echo') return new Response(await request.text());

  if (pathname === '/forever') {
    return new Response(
      new ReadableStream({
        pull(controller) {
          state.pulled += 1;
          controller.enqueue(new Uint8Array(64 * 1024));
        },
        cancel() {
          state.cancelled = true;
        },
      }),
    );
  }

  return Response.json({ method: request.method, host: new URL(request.url).host, cookie: request.headers.get('cookie') });
}

await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const meta = await (await fetch(base, { headers: { cookie: 'session=abc' } })).json();
const cookies = (await fetch(`${base}/cookies`)).headers.getSetCookie();
const echoed = await (await fetch(`${base}/echo`, { method: 'POST', body: 'x'.repeat(300_000) })).text();

// The client walks away mid-stream; the body must stop being pulled.
const aborter = new AbortController();
const streaming = await fetch(`${base}/forever`, { signal: aborter.signal });

await streaming.body.getReader().read();
aborter.abort();
await new Promise((resolve) => setTimeout(resolve, 250));
const settled = state.pulled;

await new Promise((resolve) => setTimeout(resolve, 250));

console.log(
  JSON.stringify({
    runtime: process.versions.bun ? 'bun' : 'node',
    version: process.versions.node,
    method: meta.method,
    cookie: meta.cookie,
    host: meta.host === `localhost:${server.address().port}`,
    cookies,
    echoedLength: echoed.length,
    cancelled: state.cancelled,
    stoppedPulling: state.pulled === settled,
  }),
);
server.close();
process.exit(0);
