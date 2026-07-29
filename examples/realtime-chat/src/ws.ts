import type { JanuxSocket, WebSocketConfig } from '@janux/server';
import { createRoomLog } from './rooms';
import type { ClientCommand, ServerEvent } from './protocol';

/** What each live socket knows about itself; empty until the first `join`. */
interface Session {
  room: string;
  user: string;
}

type Socket = JanuxSocket<Session>;

/**
 * The app's WebSocket endpoint, first-class: `janux dev` and `janux start`
 * find this module by convention (`src/ws.ts`), upgrade `path` themselves and
 * drive these Bun-style handlers — no custom server. Room fan-out iterates
 * the members set instead of Bun's pub/sub topics, so the exact same code
 * runs under the dev server's socket adapter.
 */

/**
 * Delay before a posted message is broadcast back, so the optimistic
 * `pending` state is visible to humans (real networks are never this fast on
 * localhost). Read per post: the e2e suite sets `0` for its socket tests.
 */
const DEFAULT_ECHO_DELAY_MS = 300;
const echoDelayMs = () => Number(process.env.CHAT_ECHO_DELAY_MS ?? DEFAULT_ECHO_DELAY_MS);

const log = createRoomLog();
const members = new Set<Socket>();
const encode = (event: ServerEvent) => JSON.stringify(event);

const roomMembers = (room: string): Socket[] => [...members].filter((socket) => socket.data.room === room);

const broadcast = (room: string, event: ServerEvent): void => {
  if (room) roomMembers(room).forEach((socket) => socket.send(encode(event)));
};

const publishPresence = (room: string): void => {
  broadcast(room, { type: 'presence', room, users: roomMembers(room).map((socket) => socket.data.user) });
};

const handleJoin = (socket: Socket, command: ClientCommand & { type: 'join' }): void => {
  const previous = socket.data.room;

  socket.data = { room: command.room, user: command.user };
  socket.send(encode({ type: 'history', room: command.room, messages: log.after(command.room, command.cursor) }));
  publishPresence(previous);
  publishPresence(command.room);
};

const handlePost = (socket: Socket, command: ClientCommand & { type: 'post' }): void => {
  const { room, user } = socket.data;

  if (!room) return;
  const message = log.append(room, { id: command.id, user, text: command.text });

  // The log is written immediately (replay must not miss it); only the
  // broadcast waits, which is what keeps the optimistic window observable.
  setTimeout(() => broadcast(room, { type: 'message', room, message }), echoDelayMs());
};

export default {
  path: '/ws',
  data: () => ({ room: '', user: '' }),

  open(socket) {
    members.add(socket);
  },

  message(socket, raw) {
    const command = JSON.parse(String(raw)) as ClientCommand;

    if (command.type === 'join') handleJoin(socket, command);
    if (command.type === 'post') handlePost(socket, command);
  },

  close(socket) {
    members.delete(socket);
    publishPresence(socket.data.room);
  },
} satisfies WebSocketConfig<Session>;
