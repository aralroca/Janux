/**
 * Node's HTTP objects, translated to and from the web ones Janux speaks.
 *
 * Every other target Janux runs on already takes a `Request` and returns a
 * `Response` — `Bun.serve`, `Deno.serve`, `export default { fetch }` on
 * Cloudflare and Netlify. Node is the exception: `node:http` predates both types
 * and hands you an `IncomingMessage`/`ServerResponse` pair instead. This module
 * is that difference, and nothing else in `@janux/node` needs to know about it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/** Methods that may not carry a body — the `Request` constructor throws if you give them one. */
const BODYLESS = new Set(['GET', 'HEAD']);

/**
 * The absolute URL the request was made to.
 *
 * `IncomingMessage.url` is only ever a path, and `new URL()` needs an origin —
 * as does every `new URL(request.url)` inside the framework. Behind a proxy the
 * scheme the browser used is not the scheme this socket saw, so
 * `x-forwarded-proto` wins when it is present: getting it wrong downgrades
 * redirects and canonical URLs to http on a site served over https.
 */
function urlOf(incoming: IncomingMessage): string {
  const host = incoming.headers.host ?? 'localhost';
  const forwarded = incoming.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();

  return new URL(incoming.url ?? '/', `${protocol ?? 'http'}://${host}`).href;
}

function headersOf(incoming: IncomingMessage): Headers {
  const headers = new Headers();

  // `rawHeaders` is a flat [name, value, name, value…] list, which is the only
  // shape that preserves a header sent more than once.
  for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
    headers.append(incoming.rawHeaders[i]!, incoming.rawHeaders[i + 1]!);
  }

  return headers;
}

/** A Node request as the `Request` the framework handles. The body stays a stream: it is not read here. */
export function toRequest(incoming: IncomingMessage): Request {
  const method = incoming.method ?? 'GET';
  const body = BODYLESS.has(method) ? undefined : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);

  return new Request(urlOf(incoming), {
    method,
    headers: headersOf(incoming),
    body,
    // Required by the spec whenever a body is a stream, and inert without one.
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

/**
 * `getSetCookie()` is the only accessor that keeps two cookies two cookies:
 * `headers.get('set-cookie')` joins them with a comma, which a browser reads as
 * one malformed cookie and drops. Everything else is a plain copy.
 */
function writeHead(response: Response, outgoing: ServerResponse): void {
  const cookies = response.headers.getSetCookie();

  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') outgoing.setHeader(name, value);
  });
  if (cookies.length > 0) outgoing.setHeader('set-cookie', cookies);
  outgoing.writeHead(response.status, response.statusText || undefined);
}

/**
 * Sends the response, streaming the body rather than buffering it — which is
 * what makes streaming SSR and `<Suspense>` arrive progressively instead of all
 * at once at the end.
 *
 * If the client hangs up first, the body is cancelled: without that, a stream
 * that produces data on demand keeps producing it for a reader that has gone.
 */
export async function writeResponse(response: Response, outgoing: ServerResponse): Promise<void> {
  writeHead(response, outgoing);

  if (!response.body) {
    outgoing.end();

    return;
  }

  const reader = response.body.getReader();
  const stop = () => void reader.cancel().catch(() => undefined);

  outgoing.on('close', stop);

  try {
    for (;;) {
      // Checked here as well as on 'close': a client that hung up before the
      // listener was attached never fires it, and the loop would spin pulling
      // chunks into a dead socket forever.
      if (outgoing.destroyed) break;

      const { done, value } = await reader.read();

      if (done) break;
      // `write` returning false means the socket is full: waiting for 'drain'
      // is the backpressure that keeps a fast producer off a slow client.
      if (!outgoing.write(value) && outgoing.writable) {
        await new Promise<void>((resolve) => outgoing.once('drain', resolve));
      }
    }
  } catch {
    // A broken pipe is a client that left, not a server error worth logging.
  } finally {
    outgoing.off('close', stop);
    outgoing.end();
  }
}
