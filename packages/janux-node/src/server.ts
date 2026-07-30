/**
 * The listening half of `@janux/node`: what `janux start` is for Bun.
 *
 * A Janux server is a `Request -> Response` function, so everything specific to
 * Node is here — the HTTP bridge on the way in and out, the static file handler
 * in front, and the 'upgrade' listener that turns a request on `websocket.path`
 * into a socket.
 */
import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { adoptSocket, createWebSocketServer, matchesPath, type NodeWebSocketServer } from '@janux/server/node-websocket';
import type { JanuxRequestHandler } from '@janux/cli/adapter';
import type { WebSocketConfig } from '@janux/server';
import { toRequest, writeResponse } from './http-bridge';

export interface NodeServerOptions {
  /** The app, as `Request -> Response`. */
  handler: JanuxRequestHandler;
  /** Serves built assets ahead of the app. Absent → every request reaches the app. */
  staticResponse?: (request: Request) => Promise<Response | undefined>;
  /** The app's `src/ws.ts`, when it has one. */
  websocket?: WebSocketConfig;
  /** 0 asks the OS for a free port — what the tests use. */
  port?: number;
  hostname?: string;
}

export interface NodeServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Upgrades on the app's path; every other upgrade is left alone rather than destroyed. */
function attachWebSocket(server: Server, config: WebSocketConfig): void {
  let wssPromise: Promise<NodeWebSocketServer> | undefined;
  const wss = () => (wssPromise ??= createWebSocketServer());

  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!matchesPath(req, config.path)) return;
    (await wss()).handleUpgrade(req, socket, head, (client: any) => adoptSocket(client, req, config));
  });
}

export async function createNodeServer({
  handler,
  staticResponse,
  websocket,
  port = Number(process.env.PORT ?? 3000),
  hostname = process.env.HOST,
}: NodeServerOptions): Promise<NodeServer> {
  const server = createServer(async (incoming, outgoing) => {
    const request = toRequest(incoming);
    const response = (await staticResponse?.(request)) ?? (await handler.fetch(request));

    await writeResponse(response, outgoing);
  });

  if (websocket) attachWebSocket(server, websocket);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, resolve);
  });

  const bound = (server.address() as AddressInfo).port;

  return {
    port: bound,
    url: `http://${hostname ?? 'localhost'}:${bound}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
