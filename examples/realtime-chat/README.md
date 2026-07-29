# Realtime chat — custom server + native WebSockets

A multi-room chat that composes `createJanuxServer` inside its own `Bun.serve`
(the [custom server recipe](https://janux.build/docs/recipes/custom-server)), because
`janux start` has no WebSocket seam yet:

- **Custom server as a testable factory** — `createChatServer(port)` wires `/ws` upgrades,
  built static assets and `createJanuxServer().fetch` into one `Bun.serve`; port `0`
  auto-assigns and `stop()` tears down, so e2e suites boot the real thing.
- **Optimistic delivery** — a sent message renders immediately as `pending` and is
  confirmed by the server echo (deliberately delayed ~300ms so the window is visible).
- **Replay on reconnect** — the server keeps a seq-ordered in-memory log per room; a
  reconnecting client re-joins with its last confirmed `seq` as cursor and receives
  only what it missed. The **drop connection** button simulates the flaky network.
- **Live presence** — join/leave broadcasts who is in the room, over `Bun.serve`
  pub/sub topics (`subscribe`/`publish`).

```bash
bun install
bun run dev   # http://localhost:4321 — builds, then serves Janux SSR + /ws on one port
```

> **Why `dev` is build-and-serve here.** `janux dev` (Vite) serves pages and HMR but has
> no seam for this example's `/ws` endpoint — under it the chat sits at `offline` forever.
> The WebSocket lives in the custom server, so `dev` runs `janux build && bun run src/serve.ts`
> (no HMR: re-run after editing). `janux start` has the same gap, which is why `start` and
> `serve` also point at `src/serve.ts`, as the custom-server recipe describes.

## Where things live

| Where | What |
| --- | --- |
| `src/server.ts` | `createChatServer(port)` — the custom-server recipe plus the `/ws` handler and room pub/sub |
| `src/serve.ts` | entry point: starts the factory on `PORT` (default 4321) |
| `src/protocol.ts` | the wire contract both sides of `/ws` share |
| `src/rooms.ts` | seq-ordered in-memory log per room — the replay cursor's source of truth |
| `src/socket.ts` | client transport: join-with-cursor, optimistic post, auto-reconnect |
| `src/components/ChatRoom.tsx` | the island: rooms, presence, messages, composer |
| `src/routes/index.tsx` | the page that mounts the island |
