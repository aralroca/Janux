# MCP server by URL, protected

An incident board whose real product is not the page — it is the URL. Every Janux app auto-serves a hosted MCP server at `/_janux/mcp`, generated from its `api()` functions; this example adds the missing production ingredient: **bearer-token protection**, plus a **committed tool contract** so the agent surface cannot drift silently.

- **MCP server with zero MCP code** — `src/server/incidents.api.ts` defines three `api()` functions; `/_janux/mcp` advertises them as tools (schemas included) over streamable HTTP, stateless JSON-RPC 2.0.
- **Bearer protection as one config line** — `janux.config.ts` declares `mcpAuth: { tokenEnv: 'AGENT_TOKEN', token: 'demo-agent-token' }` and the framework enforces it: `POST` without the token answers `401` + `WWW-Authenticate: Bearer realm="janux-mcp"`. GET stays public — a browser opening the URL still gets the landing page, whose connect commands now include the `--header "Authorization: Bearer $TOKEN"` line (placeholder only; the token never renders).
- **Guards on the wire** — `incidents.list` and `incidents.report` are `auto` and run unattended; `incidents.resolve` is `guard: 'confirm'`, so an MCP `tools/call` returns a *proposal* (`annotations.requiresApproval` in `tools/list`) and nothing executes until a human hits `/_janux/approve`.
- **Contract drift gate** — `agent-contract.json` pins tool names, guards and input schemas; `e2e/with-mcp-url.e2e.test.ts` asserts the served surface equals the golden file, and `bunx janux verify` fails the build when an agent-reachable tool ships without a description. Rename a tool and CI goes red until the contract is updated on purpose.

```bash
bun install
bun run dev   # http://localhost:4321
```

## Connect a real MCP client

The demo token works out of the box; set `AGENT_TOKEN` to rotate it:

```bash
claude mcp add --transport http incident-board \
  http://localhost:4321/_janux/mcp \
  --header "Authorization: Bearer demo-agent-token"
```

Or speak the protocol yourself:

```bash
# Without the token: 401 + WWW-Authenticate: Bearer realm="janux-mcp"
curl -si http://localhost:4321/_janux/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# With it: the three incident tools, schemas included
curl -s http://localhost:4321/_janux/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-agent-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# A confirm-guarded call proposes instead of executing
curl -s http://localhost:4321/_janux/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-agent-token' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"incidents.resolve","arguments":{"id":1}}}'
# → content: {"status":"proposal","id":"prop_api_…","tool":"incidents.resolve",…}
```

The whole protection is one declarative line — the framework maps it to the
`mcpAuth` bearer verifier in dev and in production, identically:

```ts
import { defineConfig } from 'janux';

export default defineConfig({
  mcpAuth: { tokenEnv: 'AGENT_TOKEN', token: 'demo-agent-token' },
});
```

Need more than a shared bearer (per-tenant keys, JWT introspection)? Pass your own
verifier as `ServerOptions.mcpAuth = { verify(token, req) }` through a
[custom server](https://janux.build/docs/recipes/custom-server) — the config form is
sugar over exactly that seam.

## Where things live

| File | What it shows |
|---|---|
| `src/server/incidents.api.ts` | The agent surface: `list`/`report` (`auto`) and `resolve` (`confirm`), schemas from `janux` builders |
| `src/server/board.ts` | The in-memory incident store behind the tools |
| `janux.config.ts` | The bearer gate: `mcpAuth` by env var (`AGENT_TOKEN`) with the demo default |
| `src/routes/index.tsx` | The human view: the board plus the exact commands to connect an MCP client |
| `agent-contract.json` | The committed tool contract (names, guards, input schemas) the e2e suite pins |
