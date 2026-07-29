import type { ServerEvent } from './protocol';

/**
 * The client transport. It owns exactly one WebSocket and never touches state
 * directly: Janux gates mutations to intents, effects and `on:` handlers, so
 * every server frame is re-emitted on the page bus and the island's `on:`
 * handlers do the writing. Reconnection is a dumb loop: on any non-deliberate
 * close, retry shortly and re-join with the last confirmed `seq` as cursor,
 * so the server replays only what was missed.
 */

export interface ChatHandle {
  state: any;
  emit: (event: string, payload: unknown) => void;
}

const RETRY_MS = 400;

let socket: WebSocket | undefined;
let closedOnPurpose = false;

const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

const lastSeq = (state: any): number =>
  state.messages.reduce((max: number, message: any) => (message.pending ? max : Math.max(max, message.seq)), 0);

/** Reads state, never writes it — safe from any callback. */
function sendJoin(state: any) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'join', room: state.room, user: state.user, cursor: lastSeq(state) }));
}

/** Server frames → page-bus events; history replay is just messages, one by one. */
function deliver(chat: ChatHandle, event: ServerEvent) {
  if (event.type === 'history') {
    event.messages.forEach((message) => chat.emit('chat.message', { room: event.room, ...message }));
  }
  if (event.type === 'message') chat.emit('chat.message', { room: event.room, ...event.message });
  if (event.type === 'presence') {
    chat.emit('chat.presence', { room: event.room, users: event.users.map((name) => ({ name })) });
  }
}

export function connect(chat: ChatHandle) {
  closedOnPurpose = false;
  socket = new WebSocket(wsUrl());
  socket.addEventListener('open', () => {
    chat.emit('chat.status', { status: 'online' });
    sendJoin(chat.state);
  });
  socket.addEventListener('message', (frame) => deliver(chat, JSON.parse(String(frame.data))));
  socket.addEventListener('close', () => {
    chat.emit('chat.status', { status: 'offline' });
    if (!closedOnPurpose) setTimeout(() => connect(chat), RETRY_MS);
  });
}

/** Island unmount: close for real, no retry. */
export function disconnect() {
  closedOnPurpose = true;
  socket?.close();
  socket = undefined;
}

/** Demo affordance: kill the transport like a network drop; the retry loop stays armed. */
export function dropConnection() {
  socket?.close();
}

/**
 * Optimistic post — called from the `send` intent, so the state write is
 * legal: the row renders immediately as pending; the echo confirms it.
 */
export function post(state: any, text: string) {
  const message = { id: crypto.randomUUID(), seq: 0, user: state.user, text, pending: true };

  state.messages.push(message);
  socket?.send(JSON.stringify({ type: 'post', id: message.id, text }));
}

/** Fresh room, fresh cursor: the server replays that room's log from zero. */
export function joinRoom(state: any, room: string) {
  state.room = room;
  state.messages = [];
  state.users = [];
  sendJoin(state);
}
