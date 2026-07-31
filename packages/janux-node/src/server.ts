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
// Statically, not through `@janux/server/node-websocket`'s dynamic import: that
// one keeps `ws` optional for `janux dev`, where Bun provides it natively. Here
// the specifier has to be visible to the bundler, or `build/` ships an import
// no deployment can resolve — and the app's WebSockets die on connect while
// every page still renders.
import { WebSocketServer } from 'ws';
import { adoptSocket, matchesPath } from '@janux/server/node-websocket';
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

/**
 * Upgrades on the app's path, and closes every other one.
 *
 * Node destroys an unhandled upgrade socket only while the server has *no*
 * 'upgrade' listener; attaching this one makes that our job, and ignoring a
 * request we will never answer leaks the connection until the client gives up.
 * (`janux dev` is the opposite case and rightly ignores them: Vite's own HMR
 * listener is on the same server.)
 */
function attachWebSocket(server: Server, config: WebSocketConfig): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!matchesPath(req, config.path)) return void socket.destroy();
    wss.handleUpgrade(req, socket, head, (client) => adoptSocket(client, req, config));
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
    const failed = (error: Error) => reject(error);

    server.once('error', failed);
    // The listener is removed once bound: leaving it attached would quietly
    // swallow a later server error into an already-settled promise.
    server.listen(port, hostname, () => {
      server.off('error', failed);
      resolve();
    });
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
