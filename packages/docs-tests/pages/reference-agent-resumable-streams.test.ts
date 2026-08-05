import { describe, expect, it } from 'bun:test';
import { createResumableStreams, type StreamFrame } from '@janux/agent';

/**
 * reference/agent-resumable-streams.md — the defaults table, the three answers
 * the mount can give a returning reader, and the two claims the page makes that
 * a reader would otherwise have to take on faith: a foreign stream is
 * indistinguishable from a missing one, and retention is bounded in both
 * directions (a TTL and a size cap) so an abandoned turn cannot pin memory.
 */

const OWNER = 'user-1';
const ID = 'turn-1';

const frames = (log: ReturnType<typeof createResumableStreams>, count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => from + index).forEach((id) =>
    log.append(ID, { id, chunk: { type: 'text-delta', delta: `${id}` } }),
  );

async function collect(resumed: AsyncGenerator<StreamFrame> | string): Promise<number[]> {
  if (typeof resumed === 'string') throw new Error(`expected frames, got ${resumed}`);
  const ids: number[] = [];

  for await (const frame of resumed) ids.push(frame.id);

  return ids;
}

describe('reference/agent-resumable-streams.md — createResumableStreams', () => {
  it('replays only the frames after the cursor', async () => {
    const log = createResumableStreams();

    log.open(ID, OWNER);
    frames(log, 4);
    log.close(ID);

    expect(await collect(log.resume(ID, OWNER, 1))).toEqual([2, 3]);
  });

  it('answers a foreign stream exactly like a missing one', () => {
    const log = createResumableStreams();

    log.open(ID, OWNER);
    frames(log, 1);

    expect(log.resume(ID, 'someone-else', -1)).toBe('stream_not_found');
    expect(log.resume('never-existed', OWNER, -1)).toBe('stream_not_found');
  });

  it('forgets a turn once ttlMs has passed', () => {
    let clock = 0;
    const log = createResumableStreams({ ttlMs: 30_000, now: () => clock });

    log.open(ID, OWNER);
    frames(log, 2);
    log.close(ID);
    clock = 30_001;

    expect(log.resume(ID, OWNER, -1)).toBe('stream_not_found');
    expect(log.retained(ID)).toBe(0);
  });

  it('drops the payload — and the ability to replay — past maxBytes', () => {
    const log = createResumableStreams({ maxBytes: 64 });

    log.open(ID, OWNER);
    log.append(ID, { id: 0, chunk: { type: 'text-delta', delta: 'x'.repeat(500) } });

    expect(log.resume(ID, OWNER, -1)).toBe('stream_not_resumable');
    expect(log.retained(ID)).toBe(0);
  });

  it('defaults to a 60s TTL and a 256 KiB cap, as the table says', () => {
    let clock = 0;
    const log = createResumableStreams({ now: () => clock });

    log.open(ID, OWNER);
    log.append(ID, { id: 0, chunk: { type: 'text-delta', delta: 'x'.repeat(200_000) } });
    clock = 59_999;

    expect(typeof log.resume(ID, OWNER, -1)).not.toBe('string');
    clock = 60_001;

    expect(log.resume(ID, OWNER, -1)).toBe('stream_not_found');
  });
});
