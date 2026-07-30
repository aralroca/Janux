import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { cacheControl, contentType, staticResponse } from './static-assets';

const dir = mkdtempSync(join(tmpdir(), 'janux-static-'));
const SCRIPT = `export const app = ${JSON.stringify('x'.repeat(4000))};\n`;

await Bun.write(join(dir, 'assets/index-a1b2c3d4.js'), SCRIPT);
await Bun.write(join(dir, 'sw.js'), SCRIPT);
await Bun.write(join(dir, 'logo-e5f6a7b8.woff2'), 'not really a font, but it says it is');

afterAll(() => rm(dir, { recursive: true, force: true }));

const decoded = (decompress: (bytes: Uint8Array) => Buffer, body: ArrayBuffer): string =>
  new TextDecoder().decode(decompress(new Uint8Array(body)));

function get(pathname: string, accept?: string): Promise<Response | undefined> {
  const headers = accept ? { 'accept-encoding': accept } : undefined;

  return staticResponse(dir, new Request(`http://localhost${pathname}`, { headers }));
}

describe('cacheControl', () => {
  it('lets a hashed asset be cached forever: its URL changes when its bytes do', () => {
    expect(cacheControl('/assets/index-a1b2c3d4.js')).toBe('public, max-age=31536000, immutable');
  });

  it('makes an unhashed file revalidate, since the same URL will serve new bytes', () => {
    expect(cacheControl('/sw.js')).toBe('public, max-age=0, must-revalidate');
    expect(cacheControl('/favicon.svg')).toBe('public, max-age=0, must-revalidate');
  });
});

/**
 * `Bun.file().type` used to answer this, and dropping it must not change a
 * single header a browser sees — so Bun itself is the oracle. A new extension
 * added to the map is checked against Bun rather than against someone's memory
 * of what the MIME type is.
 */
describe('contentType', () => {
  const EXTENSIONS = [
    'js', 'mjs', 'css', 'html', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
    'ico', 'woff', 'woff2', 'ttf', 'otf', 'wasm', 'xml', 'txt', 'md', 'map', 'webmanifest',
  ];

  it.each(EXTENSIONS)('agrees with Bun.file().type for .%s', (extension) => {
    expect(contentType(`/assets/thing.${extension}`)).toBe(Bun.file(`thing.${extension}`).type);
  });

  it('falls back to octet-stream for an extension nobody has a type for', () => {
    expect(contentType('/downloads/archive.wat')).toBe('application/octet-stream');
    expect(contentType('/LICENSE')).toBe('application/octet-stream');
  });

  it('covers every text format the compressor is meant to reach', () => {
    // The COMPRESSIBLE gate keys off the type, so a wrong type silently stops
    // compressing a 3 MB bundle — the exact bug this map could introduce.
    ['js', 'mjs', 'css', 'html', 'json', 'map', 'svg', 'wasm', 'xml', 'txt'].forEach((extension) => {
      expect(contentType(`x.${extension}`)).toMatch(/^(?:text\/|image\/svg|application\/(?:javascript|json|wasm|xml|manifest))/);
    });
  });
});

describe('staticResponse', () => {
  it('has nothing to say about a path that is not a file', async () => {
    expect(await get('/docs/guide/routing')).toBeUndefined();
  });

  it('compresses a script with brotli when the client takes it', async () => {
    const response = (await get('/assets/index-a1b2c3d4.js', 'gzip, deflate, br'))!;

    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(Number(response.headers.get('content-length'))).toBeLessThan(SCRIPT.length);
    expect(decoded(brotliDecompressSync, await response.arrayBuffer())).toBe(SCRIPT);
  });

  it('falls back to gzip for a client that only takes gzip', async () => {
    const response = (await get('/assets/index-a1b2c3d4.js', 'gzip'))!;

    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(decoded(gunzipSync, await response.arrayBuffer())).toBe(SCRIPT);
  });

  it('sends the bytes as they are to a client that asked for no encoding', async () => {
    const response = (await get('/assets/index-a1b2c3d4.js'))!;

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe(SCRIPT);
  });

  it('leaves an already-compressed format alone, however willing the client is', async () => {
    const response = (await get('/logo-e5f6a7b8.woff2', 'br, gzip'))!;

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('compresses a file once, however many times it is asked for', async () => {
    const bodies = await Promise.all([get('/sw.js', 'br'), get('/sw.js', 'br')]);
    const [first, second] = await Promise.all(bodies.map((response) => response!.arrayBuffer()));

    expect(new Uint8Array(first)).toEqual(new Uint8Array(second));
    expect(compressedOnce(join(dir, 'sw.js'))).toBe(true);
  });
});

/** The cache is the point: a 3 MB editor bundle cannot be re-compressed per request. */
function compressedOnce(path: string): boolean {
  const { compressions } = require('./static-assets') as { compressions: Map<string, unknown> };

  return [...compressions.keys()].filter((key) => key.startsWith(path)).length === 1;
}
