# Server API

Everything importable from `@janux/server`.

## api(def)

```ts
export const pay = api({
  description: 'Charge the cart. Irreversible.',
  input: schema({ total: money() }),
  output: schema({ orderId: str() }),   // validated after run (dev safety net)
  guard: 'confirm',
  run: ({ input, ctx }) => payments.charge(input.total, ctx.userId),
});
```

The returned value is **directly callable on the server** (`await pay({ total: 100 })`) — SSR sources and other apis use it without HTTP. Client bundles swap the whole `*.api.ts` module for fetch stubs at build time (SWC).

Conventions: files live in `src/server/<module>.api.ts`; tool names become `api.<module>.<export>`. Only `export const x = api({...})` is supported — `export default`, `export function` and re-exports fail the build loudly. Names may not contain `__`.

## createJanuxServer(options)

| Option | Type | Notes |
|---|---|---|
| `routesDir` | `string` | File-system routing root |
| `routes` | `Record<path, renderFn>` | Inline routes (tests, embedding) |
| `loadRoute` | `(filePath) => Promise<module>` | Injectable loader (Vite dev uses `ssrLoadModule`) |
| `apis` | `Record<module, moduleExports>` | api() modules |
| `storeDefs` | `Record<alias, StoreDef>` | Stores available during SSR |
| `agent` | `AgentMount` | Mounted at `/_janux/agent` |
| `ctxFor` | `(req) => Ctx` | Auth: builds the per-request context |
| `runtimeUrl`, `stylesheets`, `favicon`, `title`, `islandModules` | | Shell wiring (the CLI/plugin set these for you) |

Returns `{ fetch(req): Promise<Response>, apiTools, manifestFor }` — mount `fetch` on Bun.serve, or anything Request/Response-shaped.

## Route modules

```ts
export const meta = { title: 'Shop', description: '...' };          // or a function:
export const meta = ({ params }) => ({ title: `Order ${params.id}` });

export default async function Page({ ctx, params }) { ... }         // async supported
```

`routes/index.tsx` → `/` · `routes/orders/[id].tsx` → `/orders/:id` (params decoded).

## HTTP surface

| Endpoint | Method | Purpose |
|---|---|---|
| `/_janux/api/<module>.<name>` | POST | Invoke an api(); `x-janux-origin: agent` enforces agent guards |
| `/_janux/approve` | POST `{id}` | Execute a pending proposal (once; replays 404) |
| `/_janux/reject` | POST `{id}` | Discard a pending proposal |
| `/_janux/manifest?path=/shop` | GET | Manifest for that route: mounted components + stores + api tools |
| `/_janux/agent` | POST | The copilot turn protocol (see [Agent API](/docs/reference/agent-api)) |

Error envelope: `{ ok: false, error }` with 400 (invalid input), 403 (forbidden), 404, 500.

> **Warning:** the origin header is not a security boundary — `human` is the default and the *most privileged* origin by design. Authentication belongs in `ctxFor`; guards control the agent, not the network.
