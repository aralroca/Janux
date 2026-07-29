import type { StoredMessage } from './protocol';

/**
 * The in-memory chat log: one seq-ordered array per room. `seq` grows
 * monotonically across the whole server, so a cursor taken from any message
 * is always comparable — `after(room, cursor)` is the entire replay story.
 */
export function createRoomLog() {
  const logs = new Map<string, StoredMessage[]>();
  let seq = 0;

  const log = (room: string): StoredMessage[] => {
    const existing = logs.get(room) ?? [];

    logs.set(room, existing);

    return existing;
  };

  return {
    append(room: string, entry: { id: string; user: string; text: string }): StoredMessage {
      seq += 1;
      const message = { ...entry, seq };

      log(room).push(message);

      return message;
    },

    after(room: string, cursor: number): StoredMessage[] {
      return log(room).filter((message) => message.seq > cursor);
    },
  };
}

export type RoomLog = ReturnType<typeof createRoomLog>;
