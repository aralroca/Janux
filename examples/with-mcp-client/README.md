# Outbound MCP client

An app whose embedded agent consumes another server's MCP tools by URL: it discovers them with `connectMcp`, filters them with an allowlist, and re-exposes them on its own surface — manifest, hosted MCP and copilot alike.

- **Outbound `connectMcp`** — `src/server/remote.api.ts` keeps one pooled connection per `MCP_SERVER_URL` (`createMcpPool`: failures evict, so a remote restart self-heals) and namespaces every remote tool as `remote.*`, so a remote `search` can never collide with a local one.
- **Modern-first wire, legacy fallback** — requests go out speaking MCP `2026-07-28` (per-request `_meta`, no handshake); a legacy server that answers `400` gets the `initialize` handshake instead, sent lazily and once, and the connection remembers the era.
- **Tool filter (allowlist/prefix)** — `MCP_TOOL_INCLUDE` / `MCP_TOOL_EXCLUDE` use the same semantics as `defineAgent({ tools })`: `remote.docs.*` matches by prefix, anything else exactly, and exclude always wins. Excluded tools are invisible in the listing and refused on invocation.
- **Re-exposed surface** — `api.remote.listTools` and `api.remote.callTool` publish the filtered remote tools on this app's own manifest and hosted MCP (`/_janux/mcp`): the app is an MCP client and an MCP server at once, and its copilot reaches the remote tools through them.
- **Clean degradation** — with the remote server down the app still boots and serves; `api.remote.listTools` answers `{ available: false, error }` instead of crashing, and the island reports it.

```bash
bun install
bun run dev   # http://localhost:4321
```

Point it at a real MCP server with `MCP_SERVER_URL` (default: `http://localhost:4322/_janux/mcp`):

```bash
# Any Janux app auto-serves MCP at /_janux/mcp — e.g. the docs app on another port:
cd ../../apps/docs && bun run dev --port 4322

# Or any streamable-HTTP MCP server, with an optional bearer token and filter:
MCP_SERVER_URL=https://your.app/_janux/mcp MCP_SERVER_TOKEN=secret bun run dev
MCP_TOOL_INCLUDE='remote.docs.*' MCP_TOOL_EXCLUDE='remote.docs.readDoc' bun run dev
```

The whole outbound client is the documented two-call API:

```ts
import { connectMcp } from '@janux/agent';

const remote = connectMcp({
  url: 'http://localhost:4322/_janux/mcp',
  token: process.env.MCP_SERVER_TOKEN,
  namespace: 'remote',
});

const tools = await remote.tools(); // RemoteTool[] — names arrive prefixed 'remote.'
const result = await remote.call('remote.docs.searchDocs', { query: 'islands' });
```

## Where things live

| File | What it shows |
|---|---|
| `src/server/remote.api.ts` | The outbound client: pooled `connectMcp` per URL, the env-driven allowlist filter, and the `api()` pair that re-exposes remote tools |
| `src/components/RemoteTools.tsx` | The island: discovered remote tools, connection status, one-click invocation with the JSON result inline |
| `src/agent.ts` | `defineAgent` instructed to reach the remote tools through `api.remote.*`, with a `tools` allowlist of its own |
| `src/routes/index.tsx` | The page mounting the island |
