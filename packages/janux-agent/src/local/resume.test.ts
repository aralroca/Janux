import { afterEach, describe, expect, it } from 'bun:test';
import { serverLlm, type UIMessageChunk } from './llm';

/**
 * The reader's side of a dropped turn. What is asserted throughout is the pair
 * of properties the feature exists for: nothing missing, nothing twice — a
 * reconnect that replays one delta too many is as broken as one that loses it.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** An SSE body carrying `id:`/`data:` pairs, optionally cut before the turn ends. */
function sse(chunks: UIMessageChunk[], from = 0, { complete = true } = {}): Response {
  const frames = chunks.map((chunk, index) => `id: ${from + index}\ndata: ${JSON.stringify(chunk)}\n\n`);
  const body = complete ? [...frames, 'data: [DONE]\n\n'].join('') : frames.join('');

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-janux-stream-id': 'stream-1' },
  });
}

const delta = (text: string): UIMessageChunk => ({ type: 'text-delta', id: 't0', delta: text }) as UIMessageChunk;
const FINISH = { type: 'finish' } as UIMessageChunk;

const request = () => ({ messages: [{ role: 'user' as const, content: 'hi' }], tools: [] });

/** A fresh, isolated store per test — never the real `localStorage`. */
function fakeStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    get size() {
      return items.size;
    },
  };
}

const KEY = 'janux:llm-stream';

describe('serverLlm({ resume }) across a dropped connection', () => {
  it('picks the turn back up where it stopped — no delta lost, none repeated', async () => {
    const storage = fakeStorage();
    const seen: string[] = [];
    const responses = [sse([delta('Hel')], 0, { complete: false }), sse([delta('lo'), FINISH], 1)];

    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));

      return responses.shift()!;
    }) as any;

    const llm = serverLlm({ stream: true, resume: { storage, retryMs: 0 } });
    const reply = await llm(request());

    expect(reply.text).toBe('Hello');
    // The second call is a resume of the same turn, asking only for what follows.
    expect(seen[1]).toContain('stream=stream-1');
    expect(storage.size).toBe(0);
  });

  it('asks only for what follows the last event it actually received', async () => {
    const storage = fakeStorage();
    const headers: (string | null)[] = [];
    const responses = [sse([delta('a'), delta('b')], 0, { complete: false }), sse([delta('c'), FINISH], 2)];

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      headers.push(new Headers(init?.headers).get('last-event-id'));

      return responses.shift()!;
    }) as any;

    expect((await serverLlm({ stream: true, resume: { storage, retryMs: 0 } })(request())).text).toBe('abc');
    expect(headers[1]).toBe('1');
  });

  it('drops frames it already has when a replay overlaps, and never rewinds its cursor', async () => {
    const storage = fakeStorage();
    const headers: (string | null)[] = [];
    const responses = [
      sse([delta('a'), delta('b'), delta('c')], 0, { complete: false }),
      // An overlapping replay: ids 1 and 2 are already in hand.
      sse([delta('b'), delta('c')], 1, { complete: false }),
      sse([delta('d'), FINISH], 3),
    ];

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      headers.push(new Headers(init?.headers).get('last-event-id'));

      return responses.shift()!;
    }) as any;

    const reply = await serverLlm({ stream: true, resume: { storage, retryMs: 0 } })(request());

    expect(reply.text).toBe('abcd');
    expect(headers).toEqual([null, '2', '2']);
  });

  it('keeps its place across frames that carry no id, instead of rewinding to the start', async () => {
    const storage = fakeStorage();
    const headers: (string | null)[] = [];
    // A hop that strips `id:` — the frames still count, but they name no cursor.
    const unnumbered = new Response(`data: ${JSON.stringify(delta('c'))}\n\n`, {
      headers: { 'content-type': 'text/event-stream', 'x-janux-stream-id': 'stream-1' },
    });
    const responses = [sse([delta('a'), delta('b')], 0, { complete: false }), unnumbered, sse([FINISH], 2)];

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      headers.push(new Headers(init?.headers).get('last-event-id'));

      return responses.shift()!;
    }) as any;

    await serverLlm({ stream: true, resume: { storage, retryMs: 0 } })(request());

    expect(headers).toEqual([null, '1', '1']);
  });

  it('still delivers frames whose id is unparseable, instead of silently dropping them', async () => {
    const storage = fakeStorage();
    // `Number('x')` is NaN, and NaN compares false against the cursor in both
    // directions — the dedup check would discard every one of these.
    const body = [
      'id: x',
      `data: ${JSON.stringify(delta('kept'))}`,
      '',
      'id: y',
      `data: ${JSON.stringify(FINISH)}`,
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');

    globalThis.fetch = (async () =>
      new Response(body, {
        headers: { 'content-type': 'text/event-stream', 'x-janux-stream-id': 'stream-1' },
      })) as any;

    expect((await serverLlm({ stream: true, resume: { storage } })(request())).text).toBe('kept');
  });

  it('does not reconnect after an error chunk — that is the turn failing, not the wire', async () => {
    const storage = fakeStorage();
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;

      return sse([{ type: 'error', errorText: 'rate_limited' } as UIMessageChunk], 0, { complete: false });
    }) as any;

    await expect(serverLlm({ stream: true, resume: { storage, retryMs: 0 } })(request())).rejects.toThrow('rate_limited');
    expect(calls).toBe(1);
  });

  it('gives up after the configured number of attempts', async () => {
    const storage = fakeStorage();
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;

      return sse([delta('x')], 0, { complete: false });
    }) as any;

    await serverLlm({ stream: true, resume: { storage, retryMs: 0, attempts: 2 } })(request());

    expect(calls).toBe(3);
  });

  it('stops retrying when the mount says the stream is gone', async () => {
    const storage = fakeStorage();
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;

      return calls === 1 ? sse([delta('x')], 0, { complete: false }) : Response.json({ error: 'stream_not_found' }, { status: 404 });
    }) as any;

    const reply = await serverLlm({ stream: true, resume: { storage, retryMs: 0 } })(request());

    expect(reply.text).toBe('x');
    expect(calls).toBe(2);
  });
});

describe('serverLlm().resumeInterrupted() after a reload', () => {
  it('has nothing to say when no turn was in flight', async () => {
    const llm = serverLlm({ stream: true, resume: { storage: fakeStorage() } });

    expect(await llm.resumeInterrupted()).toBeUndefined();
  });

  it('replays the interrupted turn from the start and then forgets it', async () => {
    const storage = fakeStorage({ [KEY]: 'stream-1' });
    const painted: string[] = [];
    let asked = '';

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      asked = `${url}|${new Headers(init?.headers).get('last-event-id')}`;

      return sse([delta('Hel'), delta('lo'), FINISH], 0);
    }) as any;

    const llm = serverLlm({ stream: true, resume: { storage, retryMs: 0 } });

    llm.subscribe((chunk) => {
      if (chunk.type === 'text-delta') painted.push(chunk.delta ?? '');
    });

    expect((await llm.resumeInterrupted())?.text).toBe('Hello');
    // From the very start: a reloaded page has no text left to continue from.
    expect(asked).toBe('/_janux/llm?stream=stream-1|null');
    expect(painted).toEqual(['Hel', 'lo']);
    expect(storage.size).toBe(0);
  });

  it('forgets a stream the mount no longer has', async () => {
    const storage = fakeStorage({ [KEY]: 'long-gone' });

    globalThis.fetch = (async () => Response.json({ error: 'stream_not_found' }, { status: 404 })) as any;

    const llm = serverLlm({ stream: true, resume: { storage } });

    expect(await llm.resumeInterrupted()).toBeUndefined();
    expect(storage.size).toBe(0);
  });
});
