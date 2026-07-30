import type { FileSink } from 'bun';
import { copyFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rejectOversized, sniffContentType, SNIFF_BYTES, tooLarge } from './http-handlers';
import { MALFORMED, OVER_LIMIT, parseBoundary, parseMultipart, type PartHeaders, type PartSink } from './multipart-parser';

export interface SpoolOptions {
  /** Ceiling on the whole body. Checked against `content-length`, then again as bytes arrive. */
  maxBytes: number;
  /** Where the per-request spool directory is created. Default: the OS temp dir. */
  dir?: string;
}

export interface SpooledFile {
  /** The multipart field the part arrived under. */
  field: string;
  /** The name the client sent. Caller-supplied: never join it into a path. */
  name: string;
  /** The `content-type` the client declared — fiction until `sniffed` agrees. */
  type: string;
  /** What the first bytes actually are, or `undefined` when unrecognised. */
  sniffed: string | undefined;
  /** Bytes written to disk. */
  size: number;
  /** Absolute path of the spooled file, valid until `moveTo` or `cleanup`. */
  path: string;
  /** Moves the file to its destination, falling back to a copy across devices. */
  moveTo(destination: string): Promise<void>;
}

export interface SpooledForm {
  /** File parts, in the order they arrived. */
  files: SpooledFile[];
  /** Non-file parts, decoded as UTF-8. */
  fields: Record<string, string>;
  /** The first file sent under `field`. */
  file(field: string): SpooledFile | undefined;
  /** Removes whatever is left in the spool directory. Safe to call after `moveTo`. */
  cleanup(): Promise<void>;
}

interface SpoolState {
  size: number;
  pending: number;
  head: Uint8Array;
}

interface Collected {
  files: SpooledFile[];
  fields: Record<string, string>;
}

/** Non-file parts are metadata and stay in memory, so they get their own ceiling. */
const FIELD_BYTES = 1024 * 1024;
/** How much of a part may sit in the sink before the read loop waits for the disk to catch up. */
const FLUSH_BYTES = 4 * 1024 * 1024;

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

function concatHead(head: Uint8Array, chunk: Uint8Array): Uint8Array {
  return Buffer.concat([head, chunk.subarray(0, SNIFF_BYTES)]).subarray(0, SNIFF_BYTES);
}

async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch {
    // Different filesystems (a tmpfs spool, a disk destination): copy, then drop the original.
    await copyFile(from, to);
    await rm(from, { force: true });
  }
}

function fileOf(headers: PartHeaders, path: string, state: SpoolState): SpooledFile {
  return {
    field: headers.name,
    name: headers.filename ?? '',
    type: headers.type ?? '',
    sniffed: sniffContentType(state.head),
    size: state.size,
    path,
    moveTo: (destination) => moveFile(path, destination),
  };
}

async function writeChunk(sink: FileSink, state: SpoolState, chunk: Uint8Array): Promise<void> {
  if (state.head.byteLength < SNIFF_BYTES) state.head = concatHead(state.head, chunk);
  state.size += chunk.byteLength;
  state.pending += chunk.byteLength;
  await sink.write(chunk);
  if (state.pending < FLUSH_BYTES) return;
  state.pending = 0;

  await sink.flush();
}

/**
 * A file part goes straight to disk: the bytes are never all in memory at
 * once. Buffering keeps the read loop off the syscall path — a reader stalled
 * on every chunk lets the arriving body pile up in the socket queue faster
 * than it drains — and the flush every `FLUSH_BYTES` keeps that buffer honest
 * when the disk is the slower end.
 */
function spoolFile(headers: PartHeaders, path: string, add: (file: SpooledFile) => void): PartSink {
  const sink = Bun.file(path).writer();
  const state: SpoolState = { size: 0, pending: 0, head: new Uint8Array(0) };

  return {
    write: (chunk) => writeChunk(sink, state, chunk),
    close: async () => {
      await sink.end();
      add(fileOf(headers, path, state));
    },
  };
}

function appendField(chunks: Uint8Array[], state: { size: number }, chunk: Uint8Array): void {
  state.size += chunk.byteLength;
  if (state.size > FIELD_BYTES) throw OVER_LIMIT;
  chunks.push(chunk);
}

function collectField(headers: PartHeaders, fields: Record<string, string>): PartSink {
  const chunks: Uint8Array[] = [];
  const state = { size: 0 };

  return {
    write: (chunk) => appendField(chunks, state, chunk),
    close: () => {
      fields[headers.name] = Buffer.concat(chunks).toString('utf8');
    },
  };
}

function sinkFor(headers: PartHeaders, dir: string, collected: Collected): PartSink {
  if (headers.filename === undefined) return collectField(headers, collected.fields);
  // The name on disk is ours, never the caller's: a filename cannot escape the spool directory.
  const path = join(dir, `${crypto.randomUUID()}.part`);

  return spoolFile(headers, path, (file) => collected.files.push(file));
}

function formOf(dir: string, collected: Collected): SpooledForm {
  return {
    files: collected.files,
    fields: collected.fields,
    file: (field) => collected.files.find((candidate) => candidate.field === field),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** What the caller gets back for a body the parser refused. */
function responseFor(error: unknown, maxBytes: number): Response {
  if (error === OVER_LIMIT) return tooLarge(maxBytes);
  // A failed write (no space, no permission) is a broken deploy, not a bad request.
  if (error !== MALFORMED) throw error;

  return badRequest('malformed multipart/form-data body');
}

async function spoolInto(body: ReadableStream<Uint8Array>, boundary: string, dir: string, maxBytes: number) {
  const collected: Collected = { files: [], fields: {} };

  try {
    await parseMultipart(body, boundary, (headers) => sinkFor(headers, dir, collected), maxBytes);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });

    return responseFor(error, maxBytes);
  }

  return formOf(dir, collected);
}

/**
 * Streaming sibling of `formDataWithin`: the multipart body is parsed as it
 * arrives and every file part is written straight to a per-request temp
 * directory, so a gigabyte upload costs a chunk of memory, not a gigabyte.
 * Returns the spooled form, or the `Response` (413 over the limit, 400
 * malformed) ready to send back. Call `cleanup()` when done.
 */
export async function spoolMultipart(req: Request, options: SpoolOptions): Promise<SpooledForm | Response> {
  const early = rejectOversized(req, options.maxBytes);
  const boundary = parseBoundary(req.headers.get('content-type'));

  if (early) return early;
  if (!boundary || !req.body) return badRequest('expected a multipart/form-data body');
  const dir = await mkdtemp(join(options.dir ?? tmpdir(), 'janux-upload-'));

  return spoolInto(req.body, boundary, dir, options.maxBytes);
}
