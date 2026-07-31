import { createFsRouter, type Matcher } from './router';
import { policyOf, withCacheHeaders, type CacheConfig } from './cache';
import type { Ctx } from 'janux';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

const isHttpMethod = (name: string): boolean => HTTP_METHODS.has(name);

export interface HandlerContext {
  req: Request;
  params: Record<string, string>;
  ctx: Ctx;
  url: URL;
}

export type RouteHandler = (context: HandlerContext) => Response | Promise<Response>;
export type HandlerModule = Partial<Record<HttpMethod, RouteHandler>>;

export interface HttpHandlersOptions {
  /** Directory of `src/api/**` handler files (same grammar as pages). */
  dir: string;
  /** URL prefix the handlers mount under. Default: `/api`. */
  prefix?: string;
  loadModule: (filePath: string) => Promise<HandlerModule>;
  matchers?: Record<string, Matcher>;
  /** How a handler module's `cache` export reaches the CDN in front. */
  cache?: CacheConfig;
}

const startsWith = (bytes: Uint8Array, magic: number[], offset = 0) =>
  magic.every((byte, index) => bytes[offset + index] === byte);

const asciiAt = (bytes: Uint8Array, offset: number, text: string) =>
  startsWith(bytes, [...text].map((char) => char.charCodeAt(0)), offset);

/** How many leading bytes `sniffContentType` needs to name a format. */
export const SNIFF_BYTES = 16;

/** Magic-byte signatures for the formats upload handlers most often validate. */
const SIGNATURES: Array<{ type: string; matches: (bytes: Uint8Array) => boolean }> = [
  { type: 'image/png', matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'image/jpeg', matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  { type: 'image/gif', matches: (bytes) => asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a') },
  { type: 'image/webp', matches: (bytes) => asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP') },
  { type: 'application/pdf', matches: (bytes) => asciiAt(bytes, 0, '%PDF-') },
  { type: 'application/zip', matches: (bytes) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) },
];

/**
 * The MIME type the bytes actually are, from their magic numbers — the
 * extension and the multipart `type` field are caller-supplied fiction.
 * Covers png, jpeg, gif, webp, pdf and zip; anything else is `undefined`.
 */
export function sniffContentType(bytes: Uint8Array): string | undefined {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type;
}

/**
 * True when `type` matches one of the accepted MIME patterns (`image/png`
 * exact or `image/*` wildcard). An unrecognised type — `undefined`, what
 * `sniffContentType` returns for bytes it cannot name — never matches.
 */
export function acceptsType(type: string | undefined, accept: string[]): boolean {
  if (!type) return false;

  return accept.some((pattern) => {
    if (pattern === '*/*') return true;

    return pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern;
  });
}

/**
 * True when the file's real bytes match one of the accepted MIME patterns.
 * A `.txt` renamed to `.png` fails here no matter what `file.type` claims —
 * only the magic bytes are trusted.
 */
export async function matchesType(file: File, accept: string[]): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());

  return acceptsType(sniffContentType(head), accept);
}

export const tooLarge = (maxBytes: number) =>
  Response.json({ error: `request body exceeds the ${maxBytes}-byte limit` }, { status: 413 });

/**
 * Early 413: inspects `content-length` BEFORE any body byte is consumed, so an
 * oversized upload is refused without buffering it. Returns `null` when the
 * request may proceed (within the limit, or no declared length — pair with
 * `readBodyWithin`/`formDataWithin` to also bound chunked bodies).
 */
export function rejectOversized(req: Request, maxBytes: number): Response | null {
  const declared = Number(req.headers.get('content-length'));

  return declared > maxBytes ? tooLarge(maxBytes) : null;
}

async function collectWithin(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array[] | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    received += part.value.byteLength;
    // Over the limit: cancel the source so the sender stops, buffer nothing more.
    if (received > maxBytes) return reader.cancel().then(() => null);
    chunks.push(part.value);
  }

  return chunks;
}

/** Joins buffered chunks. Shared with the response cache, which buffers the same way. */
export function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const out = new Uint8Array(size);

  chunks.reduce((offset, chunk) => {
    out.set(chunk, offset);

    return offset + chunk.byteLength;
  }, 0);

  return out;
}

/**
 * Reads the whole body within `maxBytes`: a declared oversize 413s without
 * touching the stream, and a chunked body is cut (and the stream cancelled)
 * the moment it crosses the limit — never buffering past it.
 */
export async function readBodyWithin(req: Request, maxBytes: number): Promise<Uint8Array | Response> {
  const early = rejectOversized(req, maxBytes);

  if (early) return early;
  if (!req.body) return new Uint8Array(0);
  const chunks = await collectWithin(req.body, maxBytes);

  return chunks ? concat(chunks) : tooLarge(maxBytes);
}

/**
 * `req.formData()` with a size limit: the 413 fires before the multipart
 * parser ever sees an oversized body. Returns the parsed `FormData`, or the
 * 413 `Response` ready to send back.
 */
export async function formDataWithin(req: Request, maxBytes: number): Promise<FormData | Response> {
  const bytes = await readBodyWithin(req, maxBytes);

  if (bytes instanceof Response) return bytes;
  const headers = { 'content-type': req.headers.get('content-type') ?? '' };

  return new Response(bytes as BodyInit, { headers }).formData();
}

/**
 * Arbitrary HTTP route handlers (RFC 0002 §10.1): a `src/api/**` tree whose
 * files export method functions returning a Web `Response`. Same dynamic/
 * catch-all grammar as pages; the surface for REST endpoints, webhooks, OAuth
 * authorization-server routes, well-known documents and file up/downloads.
 */
export function createHttpHandlers(options: HttpHandlersOptions) {
  const prefix = options.prefix ?? '/api';
  const router = createFsRouter(options.dir, options.matchers);

  return {
    /** True if `pathname` falls under the handlers prefix. */
    handles(pathname: string): boolean {
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    },

    async dispatch(req: Request, ctx: Ctx): Promise<Response> {
      const url = new URL(req.url);
      const subPath = url.pathname.slice(prefix.length) || '/';
      const match = router.match(subPath);

      if (!match) return new Response('Not found', { status: 404 });
      const module = await options.loadModule(match.filePath);
      const method = req.method.toUpperCase() as HttpMethod;
      const handler = module[method] ?? (method === 'HEAD' ? module.GET : undefined);

      if (!handler) {
        // Only real verbs: other exports (config, helpers) are not methods.
        const allow = Object.keys(module).filter(isHttpMethod).join(', ');

        return new Response('Method not allowed', { status: 405, headers: allow ? { allow } : undefined });
      }

      const res = await handler({ req, params: match.params, ctx, url });

      return withCacheHeaders(res, { policy: policyOf(module), params: match.params }, options.cache);
    },
  };
}
