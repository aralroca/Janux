# Outbound MCP client

Your copilot calling **other** people's MCP servers — the mirror image of the [hosted MCP endpoint](/docs/guide/agent-and-copilot) your app exposes. Guide: [external MCP clients](/docs/recipes/external-mcp-clients).

```ts
import { connectMcp, createMcpPool } from '@janux/agent';
```

## defineAgent({ mcp })

The zero-plumbing path: hand the agent one connection (or an array of them) and the remote tools join its tool list, next to your app's own intents and `api()` tools.

```ts
export default defineAgent({
  mcp: {
    url: 'https://mcp.example.com/mcp',
    headers: { authorization: `Bearer ${process.env.EXAMPLE_TOKEN}` },
    tools: { include: ['example.search*'] },
    prefix: 'example',
  },
});
```

| `McpAgentConnection` | Notes |
|---|---|
| `url` | The server's JSON-RPC endpoint |
| `headers` | Extra headers on every request — e.g. `{ authorization: 'Bearer …' }` |
| `tools` | Which remote tools reach the model, matched on the **prefixed** name — same `include`/`exclude` semantics as `defineAgent({ tools })`, and `exclude` always wins |
| `prefix` | Namespace for the remote tool names (default: `'mcp'`) |

Discovery is **lazy and cached**: the first modeled turn lists the remote tools, later turns reuse the list. A failed discovery never downs the agent — that turn simply runs without the remote tools and the next turn re-probes, so a remote restart is self-healing. When the model calls a remote tool, the loop dispatches it over the connection and feeds the result back into the same turn, exactly like an `api.*` tool.

Everything below is the client underneath that hook — reach for it when you need the connection outside the agent loop (re-exposing remote tools on your own surface, per-user tokens via a pool, custom retargeting).

## connectMcp(options)

```ts
const remote = connectMcp({
  url: 'https://mcp.example.com/mcp',
  token: process.env.EXAMPLE_TOKEN,
  namespace: 'example',
});

const tools = await remote.tools();              // RemoteTool[]
await remote.call('example.search', { q: 'x' });
```

| `McpClientOptions` | Notes |
|---|---|
| `url` | The server's JSON-RPC endpoint |
| `token` | Forwarded as a bearer token — **the user's**, not a service key, when the remote authorizes per user. Omit for public servers |
| `namespace` | Prefix for remote tool names, so `search` from two servers doesn't collide with your own tools |
| `fetchImpl` | Inject a `fetch` — for tests, retries, or an outbound proxy |

`McpConnection` is `{ tools(), call(name, input) }` and is **dual-era**: requests go out speaking MCP `2026-07-28` (per-request `_meta`, no handshake, mirrored `Mcp-*` headers — including `Mcp-Param-*` for params the server annotates with `x-mcp-header`). A server that rejects that with a legacy `400` gets the `initialize` handshake (protocol `2025-06-18`) instead, sent **lazily and once**, and the connection remembers the era — so constructing a connection costs nothing until you actually use it, and no request re-probes. Accept covers both `application/json` and `text/event-stream`, so servers that answer over SSE work unchanged.

`RemoteTool` extends the agent's own `AgentTool` shape and adds `call(input)` — which is why remote tools can go straight into the model's tool list next to your local ones.

## createMcpPool()

```ts
const pool = createMcpPool();

const remote = pool.get(userId, { url, token: userToken, namespace: 'example' });
```

Caches one connection **per key**. Key by whatever scopes authorization — usually the user or org id, since the token differs per user; keying by URL alone would share one user's credentials across everyone.

**Failures evict.** If `tools()` or a call rejects, the pooled entry is dropped so the next request builds a fresh connection instead of retrying a poisoned one forever. That makes a remote server's restart self-healing.

## Namespacing matters

Remote tools land in the same list as your app's intents and `api()` tools. Without a namespace, a remote `search` and your own `catalog.search` are one bad prompt away from the model picking the wrong one. Prefix every server you connect.

## Trust boundary

A remote tool's **description is untrusted input** — it comes from someone else's server and the model reads it. Treat a connected MCP server like a dependency you audit: namespace it, scope the token to what it needs, and keep your dangerous local intents behind `confirm` so a hostile description can't turn into an unattended action ([guardrails](/docs/reference/agent-guardrails), [intents and guards](/docs/guide/intents-and-guards)).

Related: [Driving a Janux app from an external MCP client](/docs/recipes/external-mcp-clients) · [Agent guardrails](/docs/reference/agent-guardrails)
