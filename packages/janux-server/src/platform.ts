/**
 * The runtime primitives the request path needs, and the only place that knows
 * which runtime it is running on.
 *
 * Janux servers are `Request → Response` functions, which every target speaks
 * natively — Bun, Node, Deno, Cloudflare, Netlify. Three things are not part of
 * that contract and used to be written as `Bun.*` calls scattered across the
 * server and the CLI: streaming a file to disk (the multipart spool), reading
 * one back, and handing one to a `Response`. Scattered, they made "does this
 * deploy without Bun?" a question you answered by grepping. Here, the answer is
 * a single object, and an adapter for an exotic runtime replaces it with
 * `setPlatform` instead of patching call sites.
 *
 * Bun keeps its fast paths (`Bun.file` is a zero-copy `sendfile` on the way
 * out); Node gets `node:fs`. Neither is a fallback for the other — they are two
 * implementations of one contract, held to one test body in `platform.test.ts`.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { Readable } from 'node:stream';

/** A file being written a chunk at a time, never held whole in memory. */
export interface JanuxFileSink {
  /** Queues a chunk, resolving late when the sink wants the writer to slow down. */
  write(chunk: Uint8Array): void | Promise<void>;
  /** Lets the disk catch up with what has been queued so far. */
  flush(): void | Promise<void>;
  /** Closes the file. Resolves once every queued byte has landed. */
  end(): Promise<void>;
}

/**
 * A file that is known to exist, opened once.
 *
 * Metadata and body come from a single handle on purpose: asking the runtime
 * twice — once "does it exist", once "give me the bytes" — costs a second stat
 * on every static asset, which measured as a 24% regression on the header path
 * against the `Bun.file` code this replaced.
 */
export interface JanuxFile {
  size: number;
  /** A `Response` body streaming from disk. Call once per response. */
  stream(): BodyInit;
  /** The whole file, for the compressor. */
  bytes(): Promise<Uint8Array>;
}

export interface JanuxPlatform {
  name: 'bun' | 'node';
  fileSink(path: string): JanuxFileSink;
  /** The file at `path`, or `undefined` when it is not a readable file — a directory included. */
  openFile(path: string): Promise<JanuxFile | undefined>;
}

/** Bun's writer buffers internally, so `write` is sync and only `flush`/`end` await. */
function bunSink(path: string): JanuxFileSink {
  const sink = Bun.file(path).writer();

  return {
    write: (chunk) => {
      sink.write(chunk);
    },
    flush: async () => {
      await sink.flush();
    },
    end: async () => {
      await sink.end();
    },
  };
}

export const bunPlatform: JanuxPlatform = {
  name: 'bun',
  fileSink: bunSink,
  openFile: async (path) => {
    // The `BunFile` *is* the body: handing it to a `Response` is a zero-copy
    // send, which is why it is carried through rather than re-opened.
    const file = Bun.file(path);

    return (await file.exists()) ? { size: file.size, stream: () => file, bytes: () => file.bytes() } : undefined;
  },
};

/**
 * `write` returns a promise only when the stream is full, so the common chunk
 * costs no await — and a full stream stalls the caller until 'drain', which is
 * the backpressure Bun's writer gives for free. `events.once` rejects on
 * 'error', so a failed disk surfaces instead of hanging the read loop.
 */
function nodeSink(path: string): JanuxFileSink {
  const stream = createWriteStream(path);

  return {
    write: (chunk) => (stream.write(chunk) ? undefined : once(stream, 'drain').then(() => undefined)),
    // A zero-length write whose callback fires once everything queued before it
    // has reached the file descriptor: node streams have no explicit flush.
    flush: () => new Promise<void>((resolve, reject) => stream.write(new Uint8Array(0), (error) => (error ? reject(error) : resolve()))),
    end: () =>
      new Promise<void>((resolve, reject) => {
        stream.once('error', reject);
        stream.end(resolve);
      }),
  };
}

export const nodePlatform: JanuxPlatform = {
  name: 'node',
  fileSink: nodeSink,
  openFile: async (path) => {
    try {
      const stats = await stat(path);

      if (!stats.isFile()) return undefined;

      return {
        size: stats.size,
        stream: () => Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
        bytes: async () => new Uint8Array(await readFile(path)),
      };
    } catch {
      return undefined;
    }
  },
};

/** Detected once, at import: the runtime is not going to change under a running process. */
export const platform: JanuxPlatform = typeof Bun === 'undefined' ? nodePlatform : bunPlatform;
