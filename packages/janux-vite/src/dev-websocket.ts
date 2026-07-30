import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ViteDevServer } from 'vite';
import { adoptSocket, createWebSocketServer, matchesPath, type NodeWebSocketServer } from '@janux/server/node-websocket';
import type { WebSocketConfig } from '@janux/server';

/**
 * The dev half of first-class WebSockets: `janux dev` serves HTTP through
 * Vite's node server, where `Bun.serve`'s upgrade seam does not exist. The
 * handshake and the `JanuxSocket` adaptation are the same ones `@janux/node`
 * uses in production — they live in `@janux/server/node-websocket` so dev and
 * deploy cannot drift.
 *
 * The listener ignores every other upgrade without touching the socket:
 * Vite's own HMR WebSocket upgrades through its own listener on this server.
 */

/** Resolved per upgrade, so an edited `src/ws.ts` serves fresh handlers to new connections. */
type LoadConfig = () => Promise<WebSocketConfig | undefined>;

export function attachDevWebSocket(vite: ViteDevServer, load: LoadConfig): void {
  let wssPromise: Promise<NodeWebSocketServer> | undefined;
  const wss = () => (wssPromise ??= createWebSocketServer());

  vite.httpServer?.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const config = await load().catch(() => undefined);

    if (!config || !matchesPath(req, config.path)) return;
    (await wss()).handleUpgrade(req, socket, head, (client: any) => adoptSocket(client, req, config));
  });
}
