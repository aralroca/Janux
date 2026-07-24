# Outbound MCP client

Your copilot calling **other** people's MCP servers — the mirror image of the [hosted MCP endpoint](/docs/guide/agent-and-copilot) your app exposes. Guide: [external MCP clients](/docs/recipes/external-mcp-clients).

```ts
import { connectMcp, createMcpPool } from '@janux/agent';
```

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

`McpConnection` is `{ tools(), call(name, input) }`. `initialize` is sent **lazily and once** (protocol `2025-06-18`), so constructing a connection costs nothing until you actually use it. Accept covers both `application/json` and `text/event-stream`, so servers that answer over SSE work unchanged.

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
