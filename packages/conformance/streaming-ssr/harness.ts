import { component, jsx, renderToStream, source, type ComponentDef } from 'janux';

/**
 * Shared rigging for the streaming-SSR area. Everything here is about *driving*
 * the pipeline — releasing a gate mid-stream, reading a response the way the
 * network reads it — never about what the pipeline should say; the rows own
 * that.
 *
 * Deliberately no `useDom()` anywhere in this area: this is the server half of
 * streaming, and a registered `document` flips Janux's environment branches.
 */

/** Several macrotask ticks: the coalescing pump flushes on its own macrotask. */
export async function settle(ticks = 5): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) await new Promise((resolve) => setTimeout(resolve));
}

/** A promise that resolves with `value` after `ms` — an island's "real I/O". */
export function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Every chunk the stream flushed, in order. */
export async function chunksOf(node: unknown, options?: Record<string, unknown>): Promise<string[]> {
  const { chunks } = renderToStream(node, options);
  const collected: string[] = [];

  for await (const chunk of chunks) collected.push(chunk);

  return collected;
}

/** The whole stream, joined. */
export async function drained(node: unknown, options?: Record<string, unknown>): Promise<string> {
  return (await chunksOf(node, options)).join('');
}

/** Starts draining in the background so a row can release a gate mid-stream. */
export function driving(node: unknown, options?: Record<string, unknown>) {
  const { chunks, done, cancel } = renderToStream(node, options);
  const collected: string[] = [];
  const finished = (async () => {
    for await (const chunk of chunks) collected.push(chunk);
  })();

  return { collected, finished, done, cancel, text: () => collected.join('') };
}

/** A suspense island whose sources only settle when the row releases them. */
export function gated(name: string, options: { error?: boolean; view?: (rows: string[]) => unknown } = {}) {
  let release!: (rows: string[]) => void;
  let reject!: (error: unknown) => void;
  const gate = new Promise<string[]>((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const def = component({
    name,
    sources: { data: source({ query: () => gate }) },
    suspense: () => jsx('p', { children: 'wait' }),
    ...(options.error ? { error: ({ error }: any) => jsx('p', { children: `bad:${(error as Error).message}` }) } : {}),
    view: ({ sources }: any) =>
      options.view ? options.view(sources.data.value) : jsx('p', { children: `got:${sources.data.value.length}` }),
  });

  return { def: def as unknown as ComponentDef, release, reject };
}

/**
 * An island with async sources and NO `suspense`: it holds back its own
 * children while it loads, so the stream and the buffered render agree byte for
 * byte. The shape most of the equivalence corpus is built from.
 */
export function awaited(name: string, ms: number, view?: (rows: string[]) => unknown) {
  return component({
    name,
    sources: { data: source({ query: () => after(ms, ['a']) }) },
    // Never `??`: a view that deliberately returns null must not fall back.
    view: ({ sources }: any) => (view ? view(sources.data.value) : jsx('p', { children: name })),
  }) as unknown as ComponentDef;
}

/** An island that resolves on its own after `ms` — no gate to release. */
export function timed(name: string, ms: number, view?: () => unknown) {
  return component({
    name,
    sources: { data: source({ query: () => after(ms, ['a']) }) },
    suspense: () => jsx('p', { children: `wait:${name}` }),
    view: () => (view ? view() : jsx('p', { children: `got:${name}` })),
  }) as unknown as ComponentDef;
}

/**
 * True when a chunk cannot leave a parser mid-tag: its last `<` is closed
 * within the same chunk. Pinned instead of chunk sizes, which the throughput
 * work is free to change.
 */
export function endsOnTagBoundary(chunk: string): boolean {
  return chunk.lastIndexOf('<') <= chunk.lastIndexOf('>');
}

/** Reads a response body the way the network hands it over: one chunk per read. */
export async function responseChunks(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];

  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    out.push(decoder.decode(part.value, { stream: true }));
  }

  return out;
}

/** Reads until `marker` appears, leaving the rest of the response unread. */
export async function readUntil(response: Response, marker: string) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let received = '';

  while (!received.includes(marker)) {
    const { value, done } = await reader.read();

    if (done) break;
    received += decoder.decode(value, { stream: true });
  }

  return { received, reader };
}

export async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let rest = '';

  for (let part = await reader.read(); !part.done; part = await reader.read()) rest += decoder.decode(part.value, { stream: true });

  return rest;
}

/** `before` appears, `after` appears, and `before` comes first. */
export function ordered(html: string, before: string, later: string): string {
  const first = html.indexOf(before);
  const second = html.indexOf(later);

  if (first < 0) return `missing:${before}`;
  if (second < 0) return `missing:${later}`;

  return first < second ? 'ordered' : 'inverted';
}
