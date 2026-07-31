import type { JanuxSocket, WebSocketConfig } from '@janux/server';

/** Present so the bundle has to carry `ws`, which is how the deployment stays self-contained. */
export default {
  path: '/ws',
  message(socket: JanuxSocket, message: string | Uint8Array) {
    socket.send(`echo:${String(message)}`);
  },
} satisfies WebSocketConfig;
