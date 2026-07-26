/**
 * How `janux start` serves a built client.
 *
 * Compression is the difference between a page and a slow page: the docs app's
 * editor route ships 3.15 MB of JavaScript, and 0.72 MB of it once brotli has
 * had a look. A CDN does this for you, which is exactly why a server that only
 * runs behind one gets away without it — but `janux start` is also how an app
 * gets deployed to a box, and there the raw bytes are what the browser waits
 * for. Compressed bodies are cached in memory, so the cost is paid once per file
 * rather than once per request.
 *
 * Cache headers follow the same reasoning: a hashed asset name is a promise that
 * the bytes behind it never change, so it can be cached for a year. Everything
 * else revalidates.
 */
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { join } from 'node:path';

/** Vite's content hash: `index-a1b2c3d4.js`. */
const HASHED = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
/** Anything whose bytes are already a compressed format compresses to nothing. */
const COMPRESSIBLE = /^(?:text\/|image\/svg|application\/(?:javascript|json|wasm|xml|manifest))/;
/**
 * Quality 5 over the default 11: the difference is 4% of the body and an order
 * of magnitude of CPU, and the first request to a cold file is what pays it.
 */
const BROTLI = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } };
/** zlib hands back a `Buffer`, which is a body — TS's `BodyInit` just wants the narrower view type. */
type Body = Uint8Array<ArrayBuffer>;
const ENCODERS: Record<string, (bytes: Uint8Array) => Body> = {
  br: (bytes) => brotliCompressSync(bytes, BROTLI) as Body,
  gzip: (bytes) => gzipSync(bytes) as Body,
};

/** Exported for the test that asserts a file is compressed once, not per request. */
export const compressions = new Map<string, Body>();

export function cacheControl(pathname: string): string {
  return HASHED.test(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
}

/** Brotli first: the client that offers both is the client that prefers it. */
function pickEncoding(accepted: string, type: string): string | undefined {
  if (!COMPRESSIBLE.test(type)) return undefined;

  return Object.keys(ENCODERS).find((encoding) => accepted.includes(encoding));
}

function compress(path: string, encoding: string, bytes: Uint8Array): Body {
  const key = `${path}:${encoding}`;
  const cached = compressions.get(key);

  if (cached) return cached;

  const compressed = ENCODERS[encoding]!(bytes);

  compressions.set(key, compressed);

  return compressed;
}

/** The response for a built client file, or `undefined` when the path is not one. */
export async function staticResponse(dir: string, req: Request): Promise<Response | undefined> {
  const { pathname } = new URL(req.url);
  const path = join(dir, pathname.slice(1));
  const file = Bun.file(path);

  if (pathname === '/' || !(await file.exists())) return undefined;

  const headers = { 'cache-control': cacheControl(pathname), 'content-type': file.type };
  const encoding = pickEncoding(req.headers.get('accept-encoding') ?? '', file.type);

  if (!encoding) return new Response(file, { headers });

  return new Response(compress(path, encoding, await file.bytes()), {
    headers: { ...headers, 'content-encoding': encoding, vary: 'Accept-Encoding' },
  });
}
