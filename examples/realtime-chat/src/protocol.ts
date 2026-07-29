/**
 * The wire contract both sides of `/ws` share. Everything is JSON text frames:
 * the client issues commands, the server answers with events. `seq` is the
 * replay cursor — a client that reconnects sends the highest `seq` it has
 * confirmed and receives only what it missed.
 */

/** One chat entry exactly as the server stores and replays it. */
export interface StoredMessage {
  id: string;
  seq: number;
  user: string;
  text: string;
}

export type ClientCommand =
  | { type: 'join'; room: string; user: string; cursor: number }
  | { type: 'post'; id: string; text: string };

export type ServerEvent =
  | { type: 'history'; room: string; messages: StoredMessage[] }
  | { type: 'message'; room: string; message: StoredMessage }
  | { type: 'presence'; room: string; users: string[] };
