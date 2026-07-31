import type { JanuxSocket, WebSocketConfig } from '@janux/server';

/**
 * The capability `@janux/node` declares, exercised.
 *
 * `websocket: true` is a promise an adapter makes at build time, and a promise
 * nothing checks is a promise that breaks in production — the more so here,
 * because a bundled deployment reaches this module through the generated map
 * rather than from disk. Every message comes back with the runtime that handled
 * it, so a client can tell who answered.
 */

interface Session {
  connectedAt: number;
}

const runtime = process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.versions.node}`;

export default {
  path: '/ws',

  data: () => ({ connectedAt: Date.now() }),

  open(socket: JanuxSocket<Session>) {
    socket.send(JSON.stringify({ type: 'welcome', runtime }));
  },

  message(socket: JanuxSocket<Session>, message: string | Uint8Array) {
    socket.send(JSON.stringify({ type: 'echo', runtime, text: String(message) }));
  },
} satisfies WebSocketConfig<Session>;
