import { join } from 'node:path';
import type { Server, ServerWebSocket } from 'bun';
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from '@janux/cli/prod';
import { createRoomLog, type RoomLog } from './rooms';
import type { ClientCommand, ServerEvent } from './protocol';

/** What each live socket knows about itself; empty until the first `join`. */
interface Session {
  room: string;
  user: string;
}

type Socket = ServerWebSocket<Session>;

export interface ChatServerOptions {
  /**
   * Delay before a posted message is broadcast back, so the optimistic
   * `pending` state is visible to humans (real networks are never this fast
   * on localhost). Tests pass `0`.
   */
  echoDelayMs?: number;
}

const ROOT = join(import.meta.dir, '..');
const DEFAULT_ECHO_DELAY_MS = 300;

const topicOf = (room: string) => `room:${room}`;
const encode = (event: ServerEvent) => JSON.stringify(event);

/**
 * The custom-server recipe with one extra branch: `/ws` upgrades to a native
 * `Bun.serve` WebSocket, built static assets win next, and everything else is
 * `createJanuxServer().fetch` — pages, `api()`, manifest, MCP. A testable
 * factory: port `0` auto-assigns, `stop()` tears everything down.
 */
export async function createChatServer(port = 0, options: ChatServerOptions = {}) {
  const app = createJanuxServer(await prodServerOptions(ROOT));
  const log = createRoomLog();
  const members = new Set<Socket>();
  const echoDelayMs = options.echoDelayMs ?? DEFAULT_ECHO_DELAY_MS;

  const usersIn = (room: string): string[] =>
    [...members].filter((socket) => socket.data.room === room).map((socket) => socket.data.user);

  const publishPresence = (server: Server<Session>, room: string) => {
    if (room) server.publish(topicOf(room), encode({ type: 'presence', room, users: usersIn(room) }));
  };

  const handleJoin = (server: Server<Session>, socket: Socket, command: ClientCommand & { type: 'join' }) => {
    const previous = socket.data.room;

    if (previous) socket.unsubscribe(topicOf(previous));
    socket.data = { room: command.room, user: command.user };
    socket.subscribe(topicOf(command.room));
    socket.send(encode({ type: 'history', room: command.room, messages: log.after(command.room, command.cursor) }));
    publishPresence(server, previous);
    publishPresence(server, command.room);
  };

  const handlePost = (server: Server<Session>, socket: Socket, command: ClientCommand & { type: 'post' }) => {
    const { room, user } = socket.data;

    if (!room) return;
    const message = log.append(room, { id: command.id, user, text: command.text });

    // The log is written immediately (replay must not miss it); only the
    // broadcast waits, which is what keeps the optimistic window observable.
    setTimeout(() => server.publish(topicOf(room), encode({ type: 'message', room, message })), echoDelayMs);
  };

  const serveAsset = async (pathname: string): Promise<Response | undefined> => {
    const file = Bun.file(join(ROOT, 'dist/client', pathname));

    return pathname !== '/' && (await file.exists()) ? new Response(file) : undefined;
  };

  const server = Bun.serve<Session>({
    port,
    fetch: async (request, bunServer) => {
      const { pathname } = new URL(request.url);

      if (pathname === '/ws') {
        return bunServer.upgrade(request, { data: { room: '', user: '' } })
          ? undefined
          : new Response('WebSocket upgrade required', { status: 426 });
      }

      return (await serveAsset(pathname)) ?? app.fetch(request);
    },
    websocket: {
      open(socket) {
        members.add(socket);
      },
      message(socket, raw) {
        const command = JSON.parse(String(raw)) as ClientCommand;

        if (command.type === 'join') handleJoin(server, socket, command);
        if (command.type === 'post') handlePost(server, socket, command);
      },
      close(socket) {
        members.delete(socket);
        publishPresence(server, socket.data.room);
      },
    },
  });

  return {
    port: server.port,
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}

export type ChatServer = Awaited<ReturnType<typeof createChatServer>>;
export type { RoomLog };
