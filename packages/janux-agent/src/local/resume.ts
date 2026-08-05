/**
 * The client half of resumable streaming: what a reader has to remember to come
 * back for the rest of a turn it stopped receiving.
 *
 * Two cursors, because the three ways a reader loses a stream are not the same
 * loss. A dropped socket keeps the page — and the text already painted into it —
 * so the reconnect asks for what came *after* the last event id, in memory. A
 * reload or a second tab has no text at all, so it replays the turn from the
 * start; only the stream id has to survive, which is why `localStorage` (shared
 * across this origin's tabs) holds that and nothing else.
 */

const DEFAULT_KEY = 'janux:llm-stream';
/** Same dumb loop as `examples/realtime-chat`: wait a moment, ask again. */
const DEFAULT_RETRY_MS = 400;
const DEFAULT_ATTEMPTS = 3;

/** Everything a resume needs from `Storage`, so a test can pass a plain object. */
export type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ResumeOptions {
  /** Where the in-flight stream id is shared with reloads and other tabs. Default `localStorage`. */
  storage?: ResumeStorage;
  key?: string;
  retryMs?: number;
  /** Reconnection attempts before the turn is given up on. Default 3. */
  attempts?: number;
}

export interface ResumeSession {
  /** Remembers the turn, so a reload or another tab can pick it up. */
  begin(streamId: string | null): void;
  /**
   * False for a frame this reader already has. The mount replays from the
   * cursor, so overlap should not happen — but "exactly once" is the promise
   * being made, and a promise that depends on the other side getting an
   * off-by-one right is not one worth making.
   */
  accepts(id: number): boolean;
  /** The last event id handed to the reader; a reconnect asks only for the rest. */
  advance(id: number): void;
  /** A fresh transport for the same turn, or `undefined` when it cannot be had. */
  reconnect(): Promise<Response | undefined>;
  /** The turn is over: stop offering it to reloads. */
  finish(): void;
}

const defaultStorage = (): ResumeStorage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage;

const storageOf = (options: ResumeOptions): ResumeStorage | undefined => options.storage ?? defaultStorage();

/** The turn a previous page load left unfinished, if this origin has one. */
export function interruptedStream(options: ResumeOptions = {}): string | undefined {
  return storageOf(options)?.getItem(options.key ?? DEFAULT_KEY) ?? undefined;
}

export function forgetInterrupted(options: ResumeOptions = {}): void {
  storageOf(options)?.removeItem(options.key ?? DEFAULT_KEY);
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function resumeRequest(
  endpoint: string,
  streamId: string,
  cursor: number,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(`${endpoint}?stream=${encodeURIComponent(streamId)}`, {
    headers: {
      accept: 'text/event-stream',
      // The SSE cursor header, spelled the way the platform spells it.
      ...(cursor < 0 ? {} : { 'last-event-id': String(cursor) }),
      ...headers,
    },
  });
}

/**
 * A resume is only worth retrying while the server still has the turn. A 404
 * (expired, or never ours) and a 422 (outgrew its retention) are answers, not
 * hiccups — retrying either just spends the rate limit the mount is protecting.
 */
const retriable = (response: Response | undefined): boolean => response?.ok === true;

export function createResumeSession(
  endpoint: string,
  headers: Record<string, string> | undefined,
  options: ResumeOptions = {},
): ResumeSession {
  const key = options.key ?? DEFAULT_KEY;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const maxAttempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let streamId: string | undefined;
  let cursor = -1;
  let attempts = 0;

  return {
    begin(id) {
      streamId = id ?? undefined;
      if (streamId) storageOf(options)?.setItem(key, streamId);
    },

    // A producer that sent no `id:` at all cannot be deduplicated against, and
    // dropping those frames would lose the turn rather than protect it.
    accepts: (id) => id < 0 || id > cursor,

    advance(id) {
      // An unnumbered frame moves no cursor. Letting it write one back would
      // rewind to -1, and the next reconnect would ask for the turn from the
      // beginning — re-delivering everything already painted.
      if (id < 0) return;
      // Only real progress buys back an attempt. Resetting on any frame at all
      // means a mount that keeps replaying the same prefix — and never gets
      // past it — is retried forever instead of a bounded number of times.
      if (id > cursor) attempts = 0;
      cursor = id;
    },

    async reconnect() {
      if (!streamId || (attempts += 1) > maxAttempts) return undefined;
      await delay(retryMs);
      const response = await resumeRequest(endpoint, streamId, cursor, headers).catch(() => undefined);

      return retriable(response) ? response : undefined;
    },

    finish() {
      streamId = undefined;
      storageOf(options)?.removeItem(key);
    },
  };
}
