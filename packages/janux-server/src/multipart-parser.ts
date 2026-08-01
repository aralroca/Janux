/**
 * `multipart/form-data` as it arrives: the body is walked chunk by chunk and
 * each part's bytes are pushed to a sink, holding no more than one chunk plus
 * a boundary-sized tail. `spoolMultipart` builds the disk spool on top of it.
 */

export interface PartHeaders {
  /** The `name` the part was sent under. */
  name: string;
  /** Present only on file parts — caller-supplied, never a safe path. */
  filename?: string;
  /** The part's declared `content-type`, when it sent one. */
  type?: string;
}

/** Where a part's bytes go. `close()` runs once, after the last `write()`. */
export interface PartSink {
  write(chunk: Uint8Array): Promise<void> | void;
  close(): Promise<void> | void;
}

type State = 'delimiter' | 'headers' | 'body' | 'end';

interface Scan {
  buffer: Buffer;
  sink: PartSink | null;
  state: State;
}

interface Ctx {
  delimiter: Buffer;
  open: (headers: PartHeaders) => Promise<PartSink> | PartSink;
}

/** Thrown when the body outgrows its ceiling — recognised by identity, never surfaced to a caller. */
export const OVER_LIMIT = new Error('multipart body exceeds the limit');
/** Thrown when the bytes are not a multipart body. Anything else escaping the parser is a real failure. */
export const MALFORMED = new Error('not a well-formed multipart body');

const DASH = 0x2d;
const CR = 0x0d;
/** Headers are the one stretch held whole to be understood, so they get a ceiling of their own. */
const HEADER_BYTES = 16 * 1024;
/** A delimiter is only real once the two bytes deciding `--` or CRLF have arrived. */
const LOOKAHEAD = 2;
const CRLF_CRLF = Buffer.from('\r\n\r\n');
const BOUNDARY_PARAM = /boundary=(?:"([^"]+)"|([^\s;]+))/i;
const DISPOSITION = /^content-disposition:/i;
const NAME = /\bname="([^"]*)"/;
const FILENAME = /\bfilename="([^"]*)"/;
const PART_TYPE = /^content-type:[ \t]*(.+)$/im;

/** The boundary token of a `multipart/form-data` content-type, if it declares one. */
export function parseBoundary(contentType: string | null): string | undefined {
  if (!contentType?.toLowerCase().includes('multipart/form-data')) return undefined;
  const match = BOUNDARY_PARAM.exec(contentType);

  return match?.[1] ?? match?.[2];
}

function parseHeaders(block: string): PartHeaders {
  const disposition = block.split('\r\n').find((line) => DISPOSITION.test(line)) ?? '';

  return {
    name: NAME.exec(disposition)?.[1] ?? '',
    filename: FILENAME.exec(disposition)?.[1],
    type: PART_TYPE.exec(block)?.[1]?.trim(),
  };
}

/** Nothing to consume yet: keep only what a delimiter could still be split across. */
function keepTail(scan: Scan, size: number): false {
  scan.buffer = scan.buffer.subarray(Math.max(0, scan.buffer.length - size));

  return false;
}

/**
 * The first delimiter followed by `--` or CRLF. `--boundary` appearing inside a
 * part's own bytes is content, not a delimiter — the RFC only ends a part when
 * the boundary is properly delimited. `-1` while the answer needs more bytes.
 */
function findDelimiter(buffer: Buffer, delimiter: Buffer): number {
  for (let index = buffer.indexOf(delimiter); index >= 0; index = buffer.indexOf(delimiter, index + 1)) {
    const after = index + delimiter.length;

    if (buffer.length < after + LOOKAHEAD) return -1;
    if (buffer[after] === DASH || buffer[after] === CR) return index;
  }

  return -1;
}

/** At a `\r\n--boundary`: `--` after it ends the body, `\r\n` opens another part. */
function stepDelimiter(scan: Scan, ctx: Ctx): boolean {
  const index = findDelimiter(scan.buffer, ctx.delimiter);
  const after = index + ctx.delimiter.length;

  if (index < 0) return keepTail(scan, ctx.delimiter.length + LOOKAHEAD);
  scan.state = scan.buffer[after] === DASH ? 'end' : 'headers';
  scan.buffer = scan.buffer.subarray(after + LOOKAHEAD);

  return scan.state === 'headers';
}

/**
 * The ceiling applies to the block, not only to the search for its end.
 *
 * Checking `end < 0` alone let a *terminated* 200MB header block through: the
 * CRLFCRLF was found, so the "still looking" branch never fired, and the whole
 * thing had already been buffered and was about to be `toString`ed. A header
 * block is the one stretch this parser holds whole, which is exactly why its
 * size has to be bounded however it arrives.
 */
function headersTooBig(buffer: Buffer, end: number): boolean {
  return end < 0 ? buffer.length > HEADER_BYTES : end > HEADER_BYTES;
}

async function stepHeaders(scan: Scan, ctx: Ctx): Promise<boolean> {
  const end = scan.buffer.indexOf(CRLF_CRLF);

  if (headersTooBig(scan.buffer, end)) throw MALFORMED;
  if (end < 0) return false;
  scan.sink = await ctx.open(parseHeaders(scan.buffer.subarray(0, end).toString('utf8')));
  scan.buffer = scan.buffer.subarray(end + CRLF_CRLF.length);
  scan.state = 'body';

  return true;
}

/** Everything before the next delimiter belongs to the part; a partial one waits for more bytes. */
async function stepBody(scan: Scan, ctx: Ctx): Promise<boolean> {
  const index = findDelimiter(scan.buffer, ctx.delimiter);
  const safe = index < 0 ? Math.max(0, scan.buffer.length - ctx.delimiter.length - LOOKAHEAD) : index;

  if (safe > 0) await scan.sink!.write(scan.buffer.subarray(0, safe));
  scan.buffer = scan.buffer.subarray(safe);
  if (index < 0) return false;
  await scan.sink!.close();
  scan.sink = null;
  scan.state = 'delimiter';

  return true;
}

const STEPS = { delimiter: stepDelimiter, headers: stepHeaders, body: stepBody };

async function drain(scan: Scan, ctx: Ctx): Promise<void> {
  while (scan.state !== 'end') {
    const step = STEPS[scan.state];

    if (!(await step(scan, ctx))) return;
  }
}

/** The next chunk, refused the moment the body has read past `maxBytes`. */
async function readWithin(reader: ReadableStreamDefaultReader<Uint8Array>, state: { read: number }, maxBytes: number) {
  const part = await reader.read();

  if (part.done) throw MALFORMED;
  state.read += part.value.byteLength;
  if (state.read > maxBytes) throw OVER_LIMIT;

  return part.value;
}

/** An interrupted part still holds its sink open: let it go before unwinding. */
async function closeQuietly(sink: PartSink | null): Promise<void> {
  try {
    await sink?.close();
  } catch {
    // Whatever it was writing to is being discarded anyway.
  }
}

/** Chunk in, parts out, until the closing delimiter arrives or the ceiling is crossed. */
async function pump(scan: Scan, ctx: Ctx, reader: ReadableStreamDefaultReader<Uint8Array>, maxBytes: number) {
  const state = { read: 0 };

  while (scan.state !== 'end') {
    scan.buffer = Buffer.concat([scan.buffer, await readWithin(reader, state, maxBytes)]);
    await drain(scan, ctx);
  }
}

/**
 * Splits `body` into parts, opening a sink for each and never reading past
 * `maxBytes`. Throws `OVER_LIMIT` over the ceiling and `MALFORMED` when the
 * bytes are not a well-formed multipart body. The open sink and the source
 * are released on the way out either way.
 */
export async function parseMultipart(
  body: ReadableStream<Uint8Array>,
  boundary: string,
  open: Ctx['open'],
  maxBytes: number,
) {
  // The opening `--boundary` has no CRLF before it; pretending it does makes every delimiter identical.
  const scan: Scan = { buffer: Buffer.from('\r\n'), sink: null, state: 'delimiter' };
  const ctx: Ctx = { delimiter: Buffer.from(`\r\n--${boundary}`), open };
  const reader = body.getReader();

  try {
    await pump(scan, ctx, reader, maxBytes);
  } finally {
    await closeQuietly(scan.sink);
    await reader.cancel();
  }
}
