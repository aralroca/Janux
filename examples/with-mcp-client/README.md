# Outbound MCP client

An app that consumes **another server's** MCP tools by URL: `defineAgent({ mcp })` puts them straight into the copilot's tool list, and the app re-exposes them on its own surface — manifest, hosted MCP and copilot alike.

```bash
bun install
bun run dev   # http://localhost:4321
```

That is the whole setup. There is nothing to configure and no second process to start: the example ships **its own demo MCP server** (`src/server/demo-mcp-server.ts`, ~40 lines of JSON-RPC) and starts it on a loopback port inside the same process, so the page lists three real remote tools and invoking one is a real `tools/call` over HTTP. Point `MCP_SERVER_URL` at a real server and the demo steps aside.

## What it demonstrates

- **`defineAgent({ mcp })`** — `src/agent.ts` hands the agent the remote connection (`url`, bearer `headers`, a `tools` filter, the `remote` prefix); discovery is lazy and cached, and the loop dispatches `remote.*` calls over the wire like any `api.*` tool.
- **Outbound `connectMcp`** — `src/server/mcp-connection.ts` keeps one pooled connection per `MCP_SERVER_URL` (`createMcpPool`: failures evict, so a remote restart self-heals) and namespaces every remote tool as `remote.*`, so a remote `search` can never collide with a local one.
- **Modern-first wire, legacy fallback** — requests go out speaking MCP `2026-07-28` (per-request `_meta`, no handshake); a legacy server that answers `400` gets the `initialize` handshake instead, sent lazily and once, and the connection remembers the era.
- **Tool filter (allowlist/prefix)** — `MCP_TOOL_INCLUDE` / `MCP_TOOL_EXCLUDE` feed the exported `allowsTool`, the same `ToolFilter` semantics as `defineAgent({ tools })`: `remote.notes.*` matches by prefix, anything else exactly, and exclude always wins. Excluded tools are invisible in the listing and refused on invocation.
- **Re-exposed surface** — `api.remote.listTools` and `api.remote.callTool` publish the filtered remote tools on this app's own manifest and hosted MCP (`/_janux/mcp`): the app is an MCP client and an MCP server at once, and its copilot reaches the remote tools through them.
- **Clean degradation with a way out** — with the remote down the app still boots and serves; `api.remote.listTools` answers `{ available: false, error, hint, fix }` instead of crashing, and the page shows what to type next instead of a raw connection error.

## Point it at a real MCP server

`MCP_SERVER_URL` replaces the built-in demo server and `MCP_SERVER_TOKEN` travels as `Authorization: Bearer …`. Any streamable-HTTP MCP server works — including every Janux app, which auto-serves one at `/_janux/mcp`:

```bash
# Terminal 1 — a real, bearer-protected MCP server: the with-mcp-url example
bun run --cwd examples/with-mcp-url dev            # http://localhost:4321/_janux/mcp

# Terminal 2 — this app, pointed at it (its own port, since 4321 is taken)
MCP_SERVER_URL=http://localhost:4321/_janux/mcp \
MCP_SERVER_TOKEN=demo-agent-token \
bunx janux dev --port 4322
```

Filters are env too, and match the prefixed names:

```bash
MCP_TOOL_INCLUDE='remote.incidents.*' MCP_TOOL_EXCLUDE='remote.incidents.resolve' bun run dev
```

Unset `MCP_SERVER_URL` to fall back to the demo server. When the configured URL is not answering, the page says it in one line and prints the commands above — the rest of the app keeps working.

The whole outbound client is the documented two-call API:

```ts
import { connectMcp } from '@janux/agent';

const remote = connectMcp({
  url: 'http://localhost:4321/_janux/mcp',
  token: process.env.MCP_SERVER_TOKEN,
  namespace: 'remote',
});

const tools = await remote.tools(); // RemoteTool[] — names arrive prefixed 'remote.'
const result = await remote.call('remote.notes.search', { query: 'protocol' });
```

## Where things live

| File | What it shows |
|---|---|
| `src/server/mcp-connection.ts` | The outbound client: pooled `connectMcp` per URL, the env-driven allowlist, and the default target (demo server unless `MCP_SERVER_URL`) |
| `src/server/remote.api.ts` | The `api()` pair re-exposing the remote tools, and the actionable payload when the remote is down |
| `src/server/demo-mcp-server.ts` | The default remote: a real MCP server (JSON-RPC over HTTP) started in this process, so the example needs no setup |
| `src/server/demo-notes.ts` | The three tools that server offers — every argument has a default, so one click returns a real result |
| `src/components/RemoteTools.tsx` | The island: discovered tools, one-click invocation, and the two states (connected / not connected) |
| `src/agent.ts` | `defineAgent({ mcp })` wiring the remote server into the copilot's tool list, plus a `tools` allowlist over the app's own surface |
