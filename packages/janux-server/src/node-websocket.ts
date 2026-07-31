/**
 * Janux WebSockets on a `node:http` server.
 *
 * Bun upgrades a request through the seam `Bun.serve` gives its fetch handler.
 * Node has no such seam: you listen for 'upgrade' on the server and complete the
 * handshake yourself. The `ws` module does the handshake — Bun implements it
 * natively, Node installs it — and what is left is adapting its client to the
 * `JanuxSocket` surface an app's `src/ws.ts` is written against, so the same
 * handler code runs on both.
 *
 * This lives here rather than in an adapter because two places need it:
 * `janux dev` (Vite's server is a node server) and `@janux/node`. It was written
 * once for dev and is now shared rather than copied.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketConfig } from './server';

/** The slice of `ws`'s WebSocketServer this needs. Typed structurally so `ws` stays an optional dependency. */
export interface NodeWebSocketServer {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, done: (client: any) => void): void;
}

/** A variable specifier keeps TypeScript from resolving the untyped module statically. */
const WS_MODULE = 'ws';

export async function createWebSocketServer(): Promise<NodeWebSocketServer> {
  const mod = await import(WS_MODULE);

  return new mod.WebSocketServer({ noServer: true });
}

/** The upgrade request, re-shaped for `config.data(req)` — same contract as Bun's. */
export function fetchRequestOf(req: IncomingMessage): Request {
  const headers = Object.entries(req.headers)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, String(value)] as [string, string]);

  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), { headers });
}

/** A `ws` client made to look like Bun's `ServerWebSocket`. */
export function adoptSocket(client: any, req: IncomingMessage, config: WebSocketConfig): void {
  client.data = config.data?.(fetchRequestOf(req));
  client.on('message', (raw: Buffer, isBinary: boolean) => config.message?.(client, isBinary ? raw : raw.toString()));
  client.on('close', (code: number, reason: Buffer) => config.close?.(client, code, String(reason)));
  // Same handler surface production gets: drain fires on backpressure relief,
  // and an unhandled 'error' would take the server down with it.
  client.on('drain', () => config.drain?.(client));
  client.on('error', () => client.close());
  config.open?.(client);
}

/** Whether an upgrade request is for the app's WebSocket endpoint rather than someone else's (Vite's HMR socket). */
export function matchesPath(req: IncomingMessage, path: string): boolean {
  return (req.url ?? '').split('?')[0] === path;
}
