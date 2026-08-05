/**
 * The durable half of a resumable turn: a bounded, replayable log of the frames
 * `/_janux/llm` already numbers on the wire.
 *
 * A reader that goes away — a reload, a dropped network, a second tab opening —
 * comes back with the last `id:` it actually received and gets the remainder,
 * which is the same cursor-and-replay contract `examples/realtime-chat` uses one
 * layer down. Retention is deliberately finite: a stream expires (`ttlMs`) and a
 * stream that outgrows `maxBytes` drops its payload and stops being replayable,
 * so an abandoned turn can never pin memory. The live reader is never truncated
 * by either — only the ability to replay is given up.
 */

export interface StreamFrame {
  /** The `id:` the reader saw; the cursor a resume comes back with. */
  id: number;
  chunk: unknown;
}

export type ResumeFailure = 'stream_not_found' | 'stream_not_resumable';

export interface ResumableStreamsConfig {
  /** How long a stream stays replayable after its last frame. Default 60s. */
  ttlMs?: number;
  /** Per-stream retention cap. Past it the payload is dropped. Default 256 KiB. */
  maxBytes?: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}

export interface ResumableStreams {
  /** Starts retaining a turn for `owner` — the only identity allowed to resume it. */
  open(streamId: string, owner: string): void;
  append(streamId: string, frame: StreamFrame): void;
  close(streamId: string): void;
  /** Frames after `cursor`, live until the producer closes — or why they cannot be had. */
  resume(streamId: string, owner: string, cursor: number): AsyncGenerator<StreamFrame> | ResumeFailure;
  /** Bytes currently held for a stream; `0` once it is dropped or forgotten. */
  retained(streamId: string): number;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_BYTES = 256 * 1024;

interface Entry {
  owner: string;
  frames: StreamFrame[];
  bytes: number;
  done: boolean;
  /** Outgrew the cap: payload dropped, and this turn can never be replayed. */
  overflowed: boolean;
  expiresAt: number;
  /** Followers parked on the next frame. */
  wake: Set<() => void>;
}

/** Serialized size, which is what the wire and the cap both care about. */
const sizeOf = (chunk: unknown): number => JSON.stringify(chunk)?.length ?? 0;

const hasMore = (entry: Entry, seen: number): boolean => entry.frames.some((frame) => frame.id > seen);

const park = (entry: Entry): Promise<void> => new Promise((resolve) => entry.wake.add(resolve));

function wakeFollowers(entry: Entry): void {
  const parked = [...entry.wake];

  entry.wake.clear();
  parked.forEach((resume) => resume());
}

/** Past the cap the payload goes, but followers still have to be released. */
function dropPayload(entry: Entry): void {
  entry.overflowed = true;
  entry.frames = [];
  entry.bytes = 0;
  wakeFollowers(entry);
}

export function createResumableStreams(config: ResumableStreamsConfig = {}): ResumableStreams {
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = config.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();
  /** Reads through the TTL: an expired stream is gone the moment anyone asks. */
  const live = (streamId: string): Entry | undefined => {
    const entry = entries.get(streamId);

    if (entry && entry.expiresAt <= now()) entries.delete(streamId);

    return entries.get(streamId);
  };
  const readable = (streamId: string, owner: string): Entry | undefined => {
    const entry = live(streamId);

    return entry?.owner === owner ? entry : undefined;
  };

  /**
   * Re-resolved every round rather than captured: expiry and overflow can land
   * while a follower is parked, and both have to end the follow.
   */
  async function* follow(streamId: string, owner: string, cursor: number): AsyncGenerator<StreamFrame> {
    let seen = cursor;

    while (true) {
      const entry = readable(streamId, owner);

      if (!entry || entry.overflowed) return;
      const pending = entry.frames.filter((frame) => frame.id > seen);

      seen = pending.at(-1)?.id ?? seen;
      yield* pending;
      // Re-read before concluding: frames can land, and the producer can close,
      // while this follower was suspended handing the last batch over.
      if (hasMore(entry, seen)) continue;
      if (entry.done) return;
      await park(entry);
    }
  }

  return {
    open(streamId, owner) {
      // Sweeping here keeps the map bounded without a timer of its own.
      for (const id of [...entries.keys()]) live(id);
      const seed = { frames: [], bytes: 0, done: false, overflowed: false, wake: new Set<() => void>() };

      entries.set(streamId, { owner, ...seed, expiresAt: now() + ttlMs });
    },

    append(streamId, frame) {
      const entry = live(streamId);

      if (!entry || entry.overflowed) return;
      entry.bytes += sizeOf(frame.chunk);
      entry.expiresAt = now() + ttlMs;
      if (entry.bytes > maxBytes) return dropPayload(entry);
      entry.frames.push(frame);
      wakeFollowers(entry);
    },

    close(streamId) {
      const entry = live(streamId);

      if (!entry) return;
      entry.done = true;
      entry.expiresAt = now() + ttlMs;
      wakeFollowers(entry);
    },

    resume(streamId, owner, cursor) {
      const entry = readable(streamId, owner);

      // A stream owned by someone else answers exactly like one that never
      // existed: a guessed id must not confirm that a turn is running.
      if (!entry) return 'stream_not_found';
      if (entry.overflowed) return 'stream_not_resumable';

      return follow(streamId, owner, cursor);
    },

    retained(streamId) {
      return live(streamId)?.bytes ?? 0;
    },
  };
}
