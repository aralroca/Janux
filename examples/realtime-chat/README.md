# Realtime chat — first-class WebSockets

A multi-room chat on the framework's own WebSocket seam: `src/ws.ts` exports
the endpoint (`path` + Bun-style handlers) and `janux dev` **and** `janux start`
upgrade it themselves, on the same port as the pages — no custom server.

- **First-class WebSockets** — `src/ws.ts` is found by convention (or point
  `websocket:` in `janux.config.ts` somewhere else). Handlers get the
  production socket surface (`socket.data`, `send`, `close`) in dev too, so
  `janux dev` serves the chat **with HMR** — the gap that used to force a
  custom server here is gone.
- **Optimistic delivery** — a sent message renders immediately as `pending` and is
  confirmed by the server echo (deliberately delayed ~300ms so the window is visible).
- **Replay on reconnect** — the server keeps a seq-ordered in-memory log per room; a
  reconnecting client re-joins with its last confirmed `seq` as cursor and receives
  only what it missed. The **drop connection** button simulates the flaky network.
- **Live presence** — join/leave broadcasts who is in the room by fanning out over
  the members set, which is why the same handlers run under dev's socket adapter.

```bash
bun install
bun run dev   # http://localhost:4321 — Janux SSR + HMR + /ws on one port
```

Prefer owning the listener anyway (platform adapter, extra protocols)? Compose it
yourself — `server.serve` decides the upgrade, `server.websocket` carries the
handlers — as the [custom server recipe](https://janux.build/docs/recipes/custom-server) shows:

```ts
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from '@janux/cli';

const server = createJanuxServer(await prodServerOptions(process.cwd()));

Bun.serve({
  port: 4321,
  fetch: (request, bun) => server.serve(request, bun),
  websocket: server.websocket,
});
```

## Where things live

| Where | What |
| --- | --- |
| `src/ws.ts` | the WebSocket endpoint: `path: '/ws'`, join/post handlers, room fan-out and presence |
| `src/protocol.ts` | the wire contract both sides of `/ws` share |
| `src/rooms.ts` | seq-ordered in-memory log per room — the replay cursor's source of truth |
| `src/socket.ts` | client transport: join-with-cursor, optimistic post, auto-reconnect |
| `src/components/ChatRoom.tsx` | the island: rooms, presence, messages, composer |
| `src/routes/index.tsx` | the page that mounts the island |
