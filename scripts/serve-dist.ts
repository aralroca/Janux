/**
 * Serves a static export the way a production host does, so Lighthouse measures
 * hosting reality rather than a naive file server: clean URLs, compression on
 * text, and immutable caching on hashed assets.
 *
 * Uploading `dist/client` to a host that does none of this scores worse than
 * this script — the numbers CI asserts are the ones a correctly configured host
 * produces, which is also what recipes/deploying.md tells you to set up.
 *
 *   bun scripts/serve-dist.ts apps/docs/dist/client 4322
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'apps/docs/dist/client');
const port = Number(process.argv[3] ?? 4322);
const TEXT_FILE = /\.(html|js|css|json|svg|xml|txt|map)$/;
const HASHED_ASSET = /^\/assets\//;

/** Clean URLs: `/docs/x` is the directory the build wrote `/docs/x/index.html` into. */
function resolveFile(pathname: string): string | undefined {
  const direct = join(root, pathname);

  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const indexed = join(direct, 'index.html');

  return existsSync(indexed) ? indexed : undefined;
}

function cacheControl(pathname: string): string {
  return HASHED_ASSET.test(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
}

function acceptsGzip(request: Request): boolean {
  return (request.headers.get('accept-encoding') ?? '').includes('gzip');
}

/**
 * Compressed once per file, not once per request: a real host serves compressed
 * bytes it already has, and re-gzipping on a single-threaded server would add
 * latency to the very measurement this exists to make.
 */
// Backed by a plain ArrayBuffer, not `ArrayBufferLike`: only the narrow one is a
// `BodyInit`, and this file is typechecked now that `scripts` is in the loop.
const compressed = new Map<string, Uint8Array<ArrayBuffer>>();

async function gzipped(file: string): Promise<Uint8Array<ArrayBuffer>> {
  const cached = compressed.get(file);

  if (cached) return cached;
  const fresh = new Uint8Array(Bun.gzipSync(new Uint8Array(await Bun.file(file).arrayBuffer())));

  compressed.set(file, fresh);

  return fresh;
}

async function respond(file: string, pathname: string, request: Request): Promise<Response> {
  const blob = Bun.file(file);
  const headers = new Headers({ 'content-type': blob.type, 'cache-control': cacheControl(pathname) });

  if (!TEXT_FILE.test(file) || !acceptsGzip(request)) return new Response(blob, { headers });
  headers.set('content-encoding', 'gzip');

  return new Response(await gzipped(file), { headers });
}

if (!existsSync(root)) {
  console.error(`serve-dist: ${root} does not exist — run the app's build first.`);
  process.exit(1);
}

Bun.serve({
  port,
  fetch: async (request) => {
    const { pathname } = new URL(request.url);
    const file = resolveFile(decodeURIComponent(pathname));

    if (!file) return new Response('Not found', { status: 404 });

    return respond(file, pathname, request);
  },
});
console.log(`serve-dist: http://localhost:${port}/ → ${root}`);
