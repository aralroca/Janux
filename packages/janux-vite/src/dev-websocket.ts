import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ViteDevServer } from 'vite';
import type { WebSocketConfig } from '@janux/server';

/**
 * The dev half of first-class WebSockets: `janux dev` serves HTTP through
 * Vite's node server, where `Bun.serve`'s upgrade seam does not exist. The
 * `ws` module does — Bun implements it natively, and `janux dev` always runs
 * under Bun — so requests on the configured path are upgraded here and the
 * client is adapted to the same handler surface production gets
 * (`JanuxSocket`: `data`, `send`, `close`, text frames as strings).
 *
 * The listener ignores every other upgrade without touching the socket:
 * Vite's own HMR WebSocket upgrades through its own listener on this server.
 */

/** Resolved per upgrade, so an edited `src/ws.ts` serves fresh handlers to new connections. */
type LoadConfig = () => Promise<WebSocketConfig | undefined>;

interface WsServer {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, done: (client: any) => void): void;
}

/** A variable specifier keeps TypeScript from resolving the untyped module statically. */
const WS_MODULE = 'ws';

export function attachDevWebSocket(vite: ViteDevServer, load: LoadConfig): void {
  let wssPromise: Promise<WsServer> | undefined;
  const wss = () => (wssPromise ??= import(WS_MODULE).then((mod) => new mod.WebSocketServer({ noServer: true })));

  vite.httpServer?.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const config = await load().catch(() => undefined);

    if (!config || (req.url ?? '').split('?')[0] !== config.path) return;
    (await wss()).handleUpgrade(req, socket, head, (client: any) => adoptSocket(client, req, config));
  });
}

/** The upgrade request, re-shaped for `config.data(req)` — same contract as Bun's. */
function fetchRequestOf(req: IncomingMessage): Request {
  const headers = Object.entries(req.headers)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, String(value)] as [string, string]);

  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), { headers });
}

/** A `ws` client made to look like Bun's `ServerWebSocket`. */
function adoptSocket(client: any, req: IncomingMessage, config: WebSocketConfig): void {
  client.data = config.data?.(fetchRequestOf(req));
  client.on('message', (raw: Buffer, isBinary: boolean) => config.message?.(client, isBinary ? raw : raw.toString()));
  client.on('close', (code: number, reason: Buffer) => config.close?.(client, code, String(reason)));
  // Same handler surface production gets: drain fires on backpressure relief,
  // and an unhandled 'error' would take the dev server down with it.
  client.on('drain', () => config.drain?.(client));
  client.on('error', () => client.close());
  config.open?.(client);
}
