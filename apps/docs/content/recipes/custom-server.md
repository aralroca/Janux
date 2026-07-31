---
title: Custom server
description: The production server is a thin wrapper around one function. Compose it yourself when you need WebSockets, custom routing or another runtime.
---

# Custom server

`janux start` is a thin wrapper around one function: `createJanuxServer(options).fetch(request)` — Web `Request` in, Web `Response` out. When you need your own server (an existing app to mount into, a platform adapter, your own static strategy or logging), you write that wrapper instead of using the command.

```ts
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from '@janux/cli';

/** Static assets first, then the Janux app — what `janux start` does. */
export async function createHandler(root = process.cwd()) {
  const server = createJanuxServer(await prodServerOptions(root));

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const file = Bun.file(`${root}/dist/client${pathname}`);

    if (pathname !== '/' && (await file.exists())) return new Response(file);

    return server.fetch(request);
  };
}
```

```ts
Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: await createHandler() });
```

`prodServerOptions(root)` resolves the app's conventions exactly as the CLI does — routes, `*.api.ts` modules, stores, agent, i18n, middleware, matchers, `src/api/**` handlers, the built `client.js` and stylesheet. Pass your own `ServerOptions` instead (or spread and override) when you want different wiring: `createJanuxServer({ ...(await prodServerOptions(root)), onAudit })`.

Run `janux build` first — the handler above serves what it wrote into `dist/client`.

## What `server.fetch` owns

Anything you don't intercept before it. These paths belong to the framework:

| Path | Response |
|---|---|
| `/_janux/api/<name>` | `api()` invocation — `{ ok, result }` / `{ ok, error }` |
| `/_janux/approve`, `/_janux/reject` | human-in-the-loop proposal resolution |
| `/_janux/manifest?path=…` | the page's agent surface (tools, resources, routes) |
| `/_janux/mcp` | hosted MCP endpoint (JSON-RPC) |
| `/_janux/agent`, `/_janux/llm` | the copilot mount, when an agent is configured |
| `/llms.txt` | when `llmsTxt` is configured |
| `/sitemap.xml`, `/robots.txt` | when `siteUrl` is configured |
| `<page>.md` | markdown projection of a page |
| `/api/**` | `src/api/**` HTTP handlers (`httpHandlers.prefix` to move them) |
| `websocket.path` | `426 Upgrade Required` — the pure `fetch` cannot upgrade; see [First-class WebSockets](#first-class-websockets) |
| anything else | a page render, or `404` |

**Static files are not on that list.** `server.fetch` never reads from disk, which is why the order in the handler is yours to decide: check files first (a real asset always wins) or check routes first (a page may shadow a stale asset).

## Middleware: inside or outside

Two places, different reach:

```ts
createJanuxServer({
  ...options,
  // Inside: runs before routing, and covers /_janux/* too. A Response short-circuits.
  middleware: (req) =>
    isBlocked(req) ? new Response('Forbidden', { status: 403 }) : undefined,
});
```

Your own wrapper is *outside* — it also covers static files and anything you add before delegating. Use `ServerOptions.middleware` for app-level concerns (auth gates, redirects, rate limits) so they apply identically under `janux start`, and the wrapper for infrastructure (logging, compression, health checks).

## Per-request context

`ctxFor(req)` builds the `ctx` every route, intent and `api()` receives — the seam for sessions and tenancy:

```ts
createJanuxServer({
  ...options,
  ctxFor: async (req) => ({ user: await userFromCookie(req.headers.get('cookie')) }),
});
```

See [auth & context](/docs/recipes/auth-and-context) for the full pattern.

## First-class WebSockets

Most apps never need this recipe for realtime: declare the endpoint in
`src/ws.ts` (or point `websocket:` in `janux.config.ts` at another module) and
`janux dev` **and** `janux start` upgrade it themselves, on the same port as
the pages:

```ts
import type { WebSocketConfig } from '@janux/server';

export default {
  path: '/ws',
  // Per-socket data, attached at upgrade time from the request.
  data: (req) => ({ user: new URL(req.url).searchParams.get('u') ?? 'anon' }),
  open(socket) {
    socket.send(`hello ${socket.data.user}`);
  },
  message(socket, frame) {
    socket.send(`echo:${frame}`);
  },
} satisfies WebSocketConfig<{ user: string }>;
```

The handlers are `Bun.serve`-style (`open`/`message`/`close`/`drain`) and the
socket surface is production's `ServerWebSocket` — under `janux dev` an
adapter provides the same `data`/`send`/`close` contract, so the module runs
identically in both (fan out by iterating your own socket set rather than
Bun-only pub/sub topics if dev parity matters to you). A plain HTTP request on
`path` gets `426` from `fetch` itself.

When you DO own the `Bun.serve`, the framework hands you the two pieces
`janux start` uses: `serve(request, bunServer)` decides the upgrade when the
request matches `path` (returning `undefined`, per Bun's contract) and
delegates everything else — failed upgrades included — to the pure `fetch`;
`websocket` is the handler object `Bun.serve` takes:

```ts
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from '@janux/cli';

const server = createJanuxServer(await prodServerOptions(process.cwd()));

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: (request, bun) => server.serve(request, bun),
  websocket: server.websocket,
});
```

`examples/realtime-chat` is the full story: optimistic delivery, presence and
cursor replay over exactly this seam.

## Node, Hono, and anything else

Hono, Elysia and other Web-standard frameworks take the handler as-is:

```ts
app.all('*', (c) => server.fetch(c.req.raw));
```

For `node:http` (and Express, whose `req`/`res` are Node's), convert both directions with the adapter the Vite plugin itself uses:

```ts
import { createServer } from 'node:http';
import { sendFetchResponse, toFetchRequest } from '@janux/vite';

createServer(async (req, res) => {
  const response = await server.fetch(await toFetchRequest(req));

  await sendFetchResponse(res, response);
}).listen(3000);
```

Note the one difference: `toFetchRequest` buffers the body, so streaming uploads want a `src/api/**` handler on a Web-standard runtime instead.

## Development stays on `janux dev`

The Vite plugin *is* the dev server, and it wraps `server.fetch` the same way this recipe does — `public/` first, then the app, falling through to Vite only on a genuine page-router `404` — and upgrades the `src/ws.ts` endpoint on its own port too. It also owns HMR, the JSX transform and the `*.api.ts` client stubs, so a custom production server doesn't need a custom dev server: keep `janux dev` for development and reserve the wrapper for `start`.

## Fully static instead

If nothing in the app needs a server at request time, `output: 'static'` prerenders every page and you deploy the folder — no wrapper at all. See [deploying](/docs/recipes/deploying).

Related: [Server API](/docs/reference/server-api) · [HTTP handlers](/docs/guide/http-handlers) · [CLI](/docs/reference/cli) · [Deploying](/docs/recipes/deploying)
