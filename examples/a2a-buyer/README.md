# A2A buyer — hiring another agent over A2A

The client half of the A2A demo: a Janux app that discovers [`a2a-supplier`](../a2a-supplier) through its agent card and hires it. It is an agent to whoever uses it *and* a caller of somebody else's agent, which is the whole shape of the agentic web in one screen.

Start the supplier first (port 4341), then this one:

```bash
bun install
bun run --cwd ../a2a-supplier dev   # http://localhost:4341
bun run dev                         # http://localhost:4342
```

- **Discovery, not configuration** — `src/server/a2a-client.ts` knows one thing about the supplier: its origin (`SUPPLIER_URL`). Everything else — the endpoint URL, the skill ids, the input schemas — it reads from `/.well-known/agent-card.json`. Nothing in it is Janux-specific; it would work unchanged against an agent built with anything else.
- **The guard belongs to the callee** — `Get a quote` calls `supplier.quote` (`auto`) and gets a completed task. `Ask them to ship` calls `supplier.ship` (`confirm`) and gets `TASK_STATE_INPUT_REQUIRED`: the buyer may ask, and only a human at the supplier may decide. This app cannot approve its own order — the proposal token is settled on the supplier's own site.
- **Following the task** — `Refresh the task` polls `GetTask` until the supplier's human has answered, and then shows exactly what shipped.

## What to watch

1. Click **Ask them to ship** — the task comes back `TASK_STATE_INPUT_REQUIRED`. Check the supplier's home page: nothing has shipped.
2. Click **Open the supplier's approval desk** — a new tab, on the supplier's origin, where a human approves.
3. Come back and click **Refresh the task** — `TASK_STATE_COMPLETED`, with the shipment the supplier really recorded.

The same three steps happen identically if you drive the supplier over MCP or over its HTTP bridge instead: the guard lives in the invocation pipeline, not in the protocol.
