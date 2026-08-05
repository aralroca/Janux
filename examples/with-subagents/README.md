# Subagents & handoffs

One `defineAgent` config composing three agents:

- **Front desk** — the root copilot. Answers product questions, routes the rest.
- **`research` subagent** — reached via the `delegate.research` tool. It runs
  server-side with its own system prompt, sees only `api.support.*`, starts
  with fresh history (the task message is all its context) and works under a
  **mandatory budget** (`maxTurns`, `maxTokens`, `maxMs`). Its rounds nest in
  the trace as `invoke_agent research` and join the turn's bill.
- **`billing` handoff target** — reached via the `handoff.billing` tool. The
  conversation transfers: dialogue is kept, tool noise is dropped, the billing
  prompt and `api.billing.*` surface take over, and the envelope carries
  `agent: "billing"` so the client keeps talking to billing on later turns.

The front desk excludes `api.admin.*`. Because a subagent's tools are the
**intersection** of its own filter with its parent's, `research` cannot reach
`admin.purge` either — declaring a wider filter on the child changes nothing.
The e2e suite (`e2e/with-subagents.e2e.test.ts`) drives a real delegation over
`/_janux/agent` and proves the forbidden intent is refused without executing.

## Run it

```bash
bun install
ANTHROPIC_API_KEY=sk-... bun dev   # or any provider key / JANUX_MODEL
```

There is no chat widget in this example — the agent is the `POST /_janux/agent`
endpoint the app serves, and the home page explains the demo and shows the data
each agent sees. Talk to it from a terminal:

```bash
# Delegation: the front desk hands this to the research subagent.
curl -X POST localhost:4343/_janux/agent \
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \
  -d '{"messages":[{"role":"user","content":"what is an island?"}]}'

# Handoff: the reply carries "agent":"billing" — echo it back to keep talking to billing.
curl -X POST localhost:4343/_janux/agent \
  -H 'content-type: application/json' -H 'sec-fetch-site: same-origin' \
  -d '{"messages":[{"role":"user","content":"refund order A-1002"}]}'
```

Docs: [Subagents & handoffs](https://janux.build/docs/reference/agent-subagents).
