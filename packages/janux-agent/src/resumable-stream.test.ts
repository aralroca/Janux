import { describe, expect, it } from 'bun:test';
import { defineAgent } from './agent';

/**
 * The three ways a reader loses a turn — a reload, a dropped network, a second
 * tab joining late — are one problem at this layer: the reader comes back with
 * the last `id:` it saw and the mount owes it the remainder, exactly once.
 */

const ENV = { OPENROUTER_API_KEY: 'test-key' };
const QUESTION = { messages: [{ role: 'user', content: 'hi' }], tools: [], stream: true };

/** A provider stream the test drives frame by frame, so a reader can drop mid-turn. */
function scriptedProvider() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const send = (payload: unknown) => controller!.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

  return {
    fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    say: (content: string) => send({ choices: [{ delta: { content } }] }),
    finish: () => {
      controller!.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller!.close();
    },
  };
}

interface Frame {
  id: number;
  chunk: any;
}

/** Parses `id:`/`data:` pairs out of whatever bytes have arrived so far. */
function parseFrames(text: string): Frame[] {
  return text
    .split('\n\n')
    .map((block) => /id: (\d+)\ndata: (.*)/s.exec(block))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ id: Number(match[1]), chunk: JSON.parse(match[2]!) }));
}

/** Reads until `enough` frames are in hand, then leaves the rest on the wire. */
async function readSome(response: Response, enough: number): Promise<{ frames: Frame[]; drop: () => Promise<void> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let frames: Frame[] = [];

  while (frames.length < enough) {
    const { done, value } = await reader.read();

    if (done) break;
    text += decoder.decode(value, { stream: true });
    frames = parseFrames(text);
  }

  return { frames, drop: () => reader.cancel() };
}

async function readAll(response: Response): Promise<Frame[]> {
  return parseFrames(await response.text());
}

const deltas = (frames: Frame[]): string =>
  frames
    .filter((frame) => frame.chunk.type === 'text-delta')
    .map((frame) => frame.chunk.delta)
    .join('');

const post = (body: unknown = QUESTION) =>
  new Request('http://localhost/_janux/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });

const resume = (streamId: string, lastEventId?: number) =>
  new Request(`http://localhost/_janux/llm?stream=${streamId}`, {
    method: 'POST',
    headers: lastEventId === undefined ? {} : { 'last-event-id': String(lastEventId) },
  });

const resumableAgent = (fetchImpl: any, harness: Record<string, unknown> = {}) =>
  defineAgent({ model: 'openrouter/x/y', harness: { resumableStreams: true, ...harness } }, { env: ENV, fetchImpl });

describe('/_janux/llm resumable streaming', () => {
  it('replays the tail after the reader drops mid-answer — nothing lost, nothing repeated', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl);
    const response = await mount.handleLlm!(post());

    provider.say('Hel');
    const { frames, drop } = await readSome(response, 4);

    // The network dies here, with the provider still mid-sentence.
    await drop();
    provider.say('lo');
    provider.finish();

    const streamId = response.headers.get('x-janux-stream-id')!;
    const rest = await readAll(await mount.handleLlm!(resume(streamId, frames.at(-1)!.id)));

    expect(deltas(frames)).toBe('Hel');
    expect(deltas(rest)).toBe('lo');
    expect(rest.map((frame) => frame.id)).toEqual([4, 5, 6, 7]);
    expect(rest.at(-1)!.chunk.type).toBe('finish');
  });

  /**
   * `Number('')` is 0 and `Number('nonsense')` is NaN, and a NaN cursor compares
   * false against every frame id — so a junk header would replay an empty
   * stream and look like a working resume that lost the whole answer.
   */
  it('treats an unparseable cursor as “from the start”, not as “nothing to send”', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl);
    const response = await mount.handleLlm!(post());

    provider.say('Hello');
    provider.finish();
    await readAll(response);
    const streamId = response.headers.get('x-janux-stream-id')!;
    const junk = new Request(`http://localhost/_janux/llm?stream=${streamId}`, {
      method: 'POST',
      headers: { 'last-event-id': 'not-a-number' },
    });

    expect(deltas(await readAll(await mount.handleLlm!(junk)))).toBe('Hello');
  });

  it('lets a second tab follow the same stream from the very beginning', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl);
    const response = await mount.handleLlm!(post());

    provider.say('Hello');
    await readSome(response, 4);
    const second = mount.handleLlm!(resume(response.headers.get('x-janux-stream-id')!));

    provider.say(' there');
    provider.finish();

    expect(deltas(await readAll(await second))).toBe('Hello there');
  });

  it('never buys a second provider turn to serve a resume', async () => {
    const provider = scriptedProvider();
    let calls = 0;
    const counted = async (...args: unknown[]) => {
      calls += 1;

      return (provider.fetchImpl as any)(...args);
    };
    const mount = resumableAgent(counted);
    const response = await mount.handleLlm!(post());

    provider.say('one');
    await readSome(response, 4);
    provider.finish();
    await readAll(await mount.handleLlm!(resume(response.headers.get('x-janux-stream-id')!)));

    expect(calls).toBe(1);
  });

  it('answers a stream owned by another identity exactly like one that never existed', async () => {
    const provider = scriptedProvider();
    const seen: string[] = ['alice', 'mallory'];
    const mount = resumableAgent(provider.fetchImpl, { identityFor: async () => seen.shift() });
    const response = await mount.handleLlm!(post());

    provider.say('secret');
    provider.finish();
    await readSome(response, 4);
    const stolen = await mount.handleLlm!(resume(response.headers.get('x-janux-stream-id')!));

    expect(stolen.status).toBe(404);
    expect(((await stolen.json()) as any).error).toBe('stream_not_found');
  });

  it('rate limits a resume like any other request, so it is not the cheaper door', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl, { rateLimit: { limit: 1, windowMs: 60_000 } });
    const response = await mount.handleLlm!(post());

    provider.say('hi');
    provider.finish();
    await readSome(response, 4);
    const second = await mount.handleLlm!(resume(response.headers.get('x-janux-stream-id')!));

    expect(second.status).toBe(429);
    expect(((await second.json()) as any).error).toBe('rate_limited');
  });

  it('refuses to replay a turn that outgrew its retention cap', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl, { resumableStreams: { maxBytes: 32 } });
    const response = await mount.handleLlm!(post());

    provider.say('x'.repeat(200));
    provider.finish();
    await readAll(response);
    const late = await mount.handleLlm!(resume(response.headers.get('x-janux-stream-id')!));

    expect(late.status).toBe(422);
    expect(((await late.json()) as any).error).toBe('stream_not_resumable');
  });

  /**
   * `/_janux/llm` is an invocation path, which the framework keeps closed to
   * cross-origin GETs (`csrf.ts` answers SAFE methods there with a 405). An
   * answer being written for a signed-in visitor is precisely what must not be
   * readable by an `EventSource` on someone else's page, so resuming stays a
   * POST rather than carving an exception into that rule.
   */
  it('keeps answering 405 to a GET, stream id or not', async () => {
    const provider = scriptedProvider();
    const mount = resumableAgent(provider.fetchImpl);
    const bare = await mount.handleLlm!(new Request('http://localhost/_janux/llm'));
    const named = await mount.handleLlm!(new Request('http://localhost/_janux/llm?stream=whatever'));

    expect([bare.status, named.status]).toEqual([405, 405]);
  });
});
