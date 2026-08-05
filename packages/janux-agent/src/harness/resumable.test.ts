import { describe, expect, it } from 'bun:test';
import { createResumableStreams, type StreamFrame } from './resumable';

const OWNER = 'user-1';
const ID = 'stream-1';

/** The frames a follower actually received, drained until the producer closes. */
async function drain(frames: AsyncGenerator<StreamFrame> | string): Promise<StreamFrame[]> {
  if (typeof frames === 'string') throw new Error(`expected a follower, got ${frames}`);
  const received: StreamFrame[] = [];

  for await (const frame of frames) received.push(frame);

  return received;
}

const texts = (frames: StreamFrame[]): unknown[] => frames.map((frame) => frame.chunk);

/** Writes `count` frames starting at `from`, the way the pump numbers them. */
function write(streams: ReturnType<typeof createResumableStreams>, count: number, from = 0): void {
  for (let id = from; id < from + count; id += 1) streams.append(ID, { id, chunk: { delta: `d${id}` } });
}

describe('resumable stream log', () => {
  it('replays exactly what the reader missed — nothing lost, nothing repeated', async () => {
    const streams = createResumableStreams();

    streams.open(ID, OWNER);
    write(streams, 4);
    streams.close(ID);

    const received = await drain(streams.resume(ID, OWNER, 1));

    expect(received.map((frame) => frame.id)).toEqual([2, 3]);
    expect(texts(received)).toEqual([{ delta: 'd2' }, { delta: 'd3' }]);
  });

  it('replays the whole turn from the start for a second tab', async () => {
    const streams = createResumableStreams();

    streams.open(ID, OWNER);
    write(streams, 3);
    streams.close(ID);

    const [first, second] = await Promise.all([
      drain(streams.resume(ID, OWNER, -1)),
      drain(streams.resume(ID, OWNER, -1)),
    ]);

    expect(texts(first)).toEqual([{ delta: 'd0' }, { delta: 'd1' }, { delta: 'd2' }]);
    expect(texts(second)).toEqual(texts(first));
  });

  it('delivers frames written after the follower attached, then ends with the producer', async () => {
    const streams = createResumableStreams();

    streams.open(ID, OWNER);
    write(streams, 2);
    const following = drain(streams.resume(ID, OWNER, 0));

    write(streams, 2, 2);
    streams.close(ID);

    expect((await following).map((frame) => frame.id)).toEqual([1, 2, 3]);
  });

  it('is not found for a stream nobody opened', () => {
    expect(createResumableStreams().resume('nope', OWNER, -1)).toBe('stream_not_found');
  });

  it('is not found for another identity, so a guessed id is not an oracle', () => {
    const streams = createResumableStreams();

    streams.open(ID, OWNER);
    write(streams, 1);

    expect(streams.resume(ID, 'someone-else', -1)).toBe('stream_not_found');
  });

  it('forgets a stream once its TTL passes', () => {
    let clock = 0;
    const streams = createResumableStreams({ ttlMs: 100, now: () => clock });

    streams.open(ID, OWNER);
    write(streams, 2);
    streams.close(ID);
    clock = 101;

    expect(streams.resume(ID, OWNER, -1)).toBe('stream_not_found');
  });

  it('stops being resumable — and drops the payload — past the size cap', () => {
    const streams = createResumableStreams({ maxBytes: 40 });

    streams.open(ID, OWNER);
    streams.append(ID, { id: 0, chunk: { delta: 'x'.repeat(200) } });

    expect(streams.resume(ID, OWNER, -1)).toBe('stream_not_resumable');
    expect(streams.retained(ID)).toBe(0);
  });
});
