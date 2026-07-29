import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { createServer } from 'vite';
import { janux } from './plugin';

/**
 * First-class WebSockets under `janux dev`: the app's `src/ws.ts` handlers
 * must answer on the SAME port Vite serves pages on (the client derives the
 * ws URL from `location.host`), with the production socket surface — `data`
 * from the upgrade request, text frames as strings — and a plain GET on the
 * path must get the framework's 426, not a page-router 404.
 */
describe('janux dev first-class websockets', () => {
  it('upgrades src/ws.ts on the dev port and 426s a plain GET', async () => {
    const root = join(import.meta.dirname, '__fixtures__/ws-app');
    const vite = await createServer({ root, logLevel: 'error', plugins: [janux()], server: { port: 0 } });

    await vite.listen();
    const port = (vite.httpServer?.address() as { port: number }).port;
    const frames: string[] = [];
    const socket = new WebSocket(`ws://localhost:${port}/ws?u=ana`);

    await new Promise<void>((resolve, reject) => {
      socket.onmessage = (event) => {
        frames.push(String(event.data));
        if (frames.length === 2) resolve();
      };
      socket.onopen = () => socket.send('ping');
      socket.onerror = () => reject(new Error('socket failed to open'));
    });
    expect(frames).toEqual(['hello ana', 'echo:ping']);

    const plain = await fetch(`http://localhost:${port}/ws`);

    expect(plain.status).toBe(426);
    socket.close();
    await vite.close();
  }, 30_000);
});
