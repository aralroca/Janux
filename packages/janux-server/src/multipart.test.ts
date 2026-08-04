import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spoolMultipart } from './multipart';

const BOUNDARY = 'janux-spool-boundary';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

interface Part {
  name: string;
  filename?: string;
  type?: string;
  body: Uint8Array | string;
}

/** A real `multipart/form-data` body, byte for byte — the parser gets no help from a friendlier encoder. */
function multipart(parts: Part[]): Uint8Array<ArrayBuffer> {
  const blocks = parts.flatMap((part) => [
    Buffer.from(`--${BOUNDARY}\r\ncontent-disposition: form-data; name="${part.name}"`),
    Buffer.from(part.filename === undefined ? '' : `; filename="${part.filename}"`),
    Buffer.from(part.type === undefined ? '\r\n\r\n' : `\r\ncontent-type: ${part.type}\r\n\r\n`),
    Buffer.from(part.body),
    Buffer.from('\r\n'),
  ]);

  return new Uint8Array(Buffer.concat([...blocks, Buffer.from(`--${BOUNDARY}--\r\n`)]));
}

/** Delivers `bytes` in `size`-byte chunks with no `content-length` — a chunked upload. */
function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  const state = { offset: 0 };

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.subarray(state.offset, state.offset + size));
      state.offset += size;
    },
  });
}

function post(body: BodyInit, boundary: string | null = BOUNDARY): Request {
  const type = boundary === null ? 'application/json' : `multipart/form-data; boundary=${boundary}`;

  return new Request('http://x/api/upload', { method: 'POST', body, headers: { 'content-type': type } });
}

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'janux-spool-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('spoolMultipart', () => {
  it('spools file parts to disk and keeps plain fields in memory', async () => {
    const body = multipart([
      { name: 'title', body: 'holiday' },
      { name: 'file', filename: 'pixel.png', type: 'image/png', body: PNG },
    ]);
    const form = await spoolMultipart(post(body), { maxBytes: 1_000_000, dir });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(form.fields).toEqual({ title: 'holiday' });
    expect(form.files.map((file) => [file.field, file.name, file.type, file.size])).toEqual([
      ['file', 'pixel.png', 'image/png', PNG.byteLength],
    ]);
    expect(new Uint8Array(readFileSync(form.files[0]!.path))).toEqual(PNG);
    await form.cleanup();
  });

  it('reassembles a body delivered one byte at a time', async () => {
    const body = multipart([
      { name: 'file', filename: 'a.png', type: 'image/png', body: PNG },
      { name: 'note', body: 'split across every boundary' },
    ]);
    const form = await spoolMultipart(post(chunked(body, 1)), { maxBytes: 1_000_000, dir });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(form.fields.note).toBe('split across every boundary');
    expect(new Uint8Array(readFileSync(form.files[0]!.path))).toEqual(PNG);
    await form.cleanup();
  });

  it('keeps CRLFs and boundary lookalikes inside a part intact', async () => {
    const content = `line\r\n--${BOUNDARY}x not the end\r\nstill the same part`;
    const form = await spoolMultipart(post(chunked(multipart([{ name: 'f', filename: 'a.txt', body: content }]), 7)), {
      maxBytes: 1_000_000,
      dir,
    });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(readFileSync(form.files[0]!.path, 'utf8')).toBe(content);
    await form.cleanup();
  });

  it('writes to disk while the body is still arriving, never buffering it whole', async () => {
    // The proof that it streams: halfway through the upload the spooled file
    // already holds bytes. A buffer-then-parse implementation leaves it empty.
    const chunk = new Uint8Array(64 * 1024).fill(0x41);
    const body = multipart([{ name: 'file', filename: 'big.bin', body: Buffer.concat(Array(64).fill(chunk)) }]);
    const observed: number[] = [];
    const watched = chunked(body, 128 * 1024).pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(part, controller) {
          observed.push(spooledBytes(dir));
          controller.enqueue(part);
        },
      }),
    );
    const form = await spoolMultipart(post(watched), { maxBytes: 10_000_000, dir });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(form.files[0]!.size).toBe(64 * 64 * 1024);
    expect(Math.max(...observed)).toBeGreaterThan(0);
    expect(Math.max(...observed)).toBeLessThan(form.files[0]!.size);
    await form.cleanup();
  });

  it('413s from content-length before a single body byte is read', async () => {
    const body = multipart([{ name: 'file', filename: 'big.bin', body: new Uint8Array(4096) }]);
    const response = await spoolMultipart(post(body), { maxBytes: 1024, dir });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(413);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('413s a chunked body mid-stream, cancelling the source and leaving nothing spooled', async () => {
    // A part that opens and never ends, like a client that keeps sending: no
    // content-length to reject it early, so the ceiling has to bite mid-stream.
    const state = { cancelled: false, sent: 0 };
    const opening = Buffer.from(`--${BOUNDARY}\r\ncontent-disposition: form-data; name="f"; filename="a.bin"\r\n\r\n`);
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(state.sent++ === 0 ? opening : new Uint8Array(64)),
      cancel: () => {
        state.cancelled = true;
      },
    });
    const response = await spoolMultipart(post(endless), { maxBytes: 256, dir });

    expect((response as Response).status).toBe(413);
    expect(state.cancelled).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('413s a single field value that would only live in memory', async () => {
    const huge = 'a'.repeat(2 * 1024 * 1024);
    const response = await spoolMultipart(post(chunked(multipart([{ name: 'bio', body: huge }]), 65_536)), {
      maxBytes: 100 * 1024 * 1024,
      dir,
    });

    expect((response as Response).status).toBe(413);
  });

  it('names the field ceiling it broke, not the body ceiling it never reached', async () => {
    // A 413 that quotes the 100MB body limit for a 2MB field reads as a lie:
    // the caller shrinks the upload and gets refused all over again.
    const huge = 'a'.repeat(2 * 1024 * 1024);
    const response = await spoolMultipart(post(chunked(multipart([{ name: 'bio', body: huge }]), 65_536)), {
      maxBytes: 100 * 1024 * 1024,
      dir,
    });

    expect(await (response as Response).json()).toEqual({ error: 'a form field exceeds the 1048576-byte limit' });
  });

  it('400s a part whose headers never end, instead of holding them all', async () => {
    // Header bytes are the one stretch that cannot be streamed out, so an
    // endless `content-disposition` would otherwise grow to the body ceiling.
    const state = { sent: 0 };
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) =>
        controller.enqueue(Buffer.from(state.sent++ === 0 ? `--${BOUNDARY}\r\ncontent-disposition: a` : 'a'.repeat(4096))),
    });
    const response = await spoolMultipart(post(endless), { maxBytes: 100 * 1024 * 1024, dir });

    expect((response as Response).status).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('400s a body that is not multipart/form-data', async () => {
    const response = await spoolMultipart(post('{"not":"multipart"}', null), { maxBytes: 1024, dir });

    expect((response as Response).status).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('400s a truncated body and removes what it had spooled', async () => {
    const full = multipart([{ name: 'file', filename: 'a.png', type: 'image/png', body: PNG }]);
    const response = await spoolMultipart(post(full.subarray(0, full.byteLength - 20)), { maxBytes: 1_000_000, dir });

    expect((response as Response).status).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('rejects when it cannot create the spool directory, instead of blaming the caller', async () => {
    // A spool location that is not a usable directory is a broken deploy, not a
    // bad request: the handler gets a rejection (a 500), never a polite 400
    // about the upload. A file standing where the directory should be says that
    // on every OS — a mode-0o500 directory only says it to a non-root POSIX user.
    const notADirectory = join(dir, 'spool.txt');

    writeFileSync(notADirectory, 'not a directory');
    const body = multipart([{ name: 'file', filename: 'a.png', type: 'image/png', body: PNG }]);

    await expect(spoolMultipart(post(body), { maxBytes: 1_000_000, dir: notADirectory })).rejects.toThrow();
  });

  it('sniffs the real type from the magic bytes, keeping the declared one apart', async () => {
    const body = multipart([{ name: 'file', filename: 'fake.png', type: 'image/png', body: 'plain text, not a PNG' }]);
    const form = await spoolMultipart(post(body), { maxBytes: 1_000_000, dir });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(form.file('file')!.type).toBe('image/png');
    expect(form.file('file')!.sniffed).toBeUndefined();
    await form.cleanup();
  });

  it('sniffs a file whose bytes straddle the first chunks', async () => {
    const form = await spoolMultipart(post(chunked(multipart([{ name: 'f', filename: 'p.png', body: PNG }]), 3)), {
      maxBytes: 1_000_000,
      dir,
    });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    expect(form.file('f')!.sniffed).toBe('image/png');
    await form.cleanup();
  });

  it('moves a spooled file to its destination and cleans up the rest', async () => {
    const body = multipart([
      { name: 'keep', filename: 'a.png', type: 'image/png', body: PNG },
      { name: 'drop', filename: 'b.png', type: 'image/png', body: PNG },
    ]);
    const form = await spoolMultipart(post(body), { maxBytes: 1_000_000, dir });

    if (form instanceof Response) throw new Error(`expected a form, got ${form.status}`);
    const destination = join(dir, 'kept.png');

    await form.file('keep')!.moveTo(destination);
    await form.cleanup();
    expect(new Uint8Array(readFileSync(destination))).toEqual(PNG);
    expect(existsSync(form.file('drop')!.path)).toBe(false);
  });
});

/** Bytes on disk under `dir` right now — the spool as it fills. */
function spooledBytes(root: string): number {
  return readdirSync(root, { recursive: true })
    .map((entry) => statSync(join(root, String(entry))))
    .filter((stat) => stat.isFile())
    .reduce((total, stat) => total + stat.size, 0);
}
