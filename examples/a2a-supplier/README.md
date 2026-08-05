# A2A supplier — an app that is an agent for other agents

The server half of the A2A demo. Three `api()` functions, and with no integration code the app becomes an agent other agents can discover and hire: a published **agent card**, an **A2A endpoint**, and a `confirm` guard that keeps a human in the loop even when the caller is on another machine.

Run it together with [`a2a-buyer`](../a2a-buyer).

- **A derived agent card** — `GET /.well-known/agent-card.json` is generated from `src/server/supplier.api.ts`: name, description, the JSON-RPC interface, every callable tool as an A2A skill, each tool's guard as a tag, and each input schema in the declared `tool-invocation` extension. Nothing about the card is written by hand, so it cannot describe an app other than the one that answers.
- **An A2A endpoint next to the MCP one** — `POST /_janux/a2a` speaks the [A2A](https://a2a-protocol.org/) JSON-RPC binding (`SendMessage`, `GetTask`). It shares the app's single invocation pipeline with `/_janux/mcp` and the HTTP bridge, so an outside agent gets exactly the authority it would get through any other door — no more.
- **A guard in the middle** — `supplier.catalog` and `supplier.quote` are `auto` and answer in one round trip. `supplier.ship` is `guard: 'confirm'`: an A2A call returns a task in `TASK_STATE_INPUT_REQUIRED` and **nothing runs**. It stays that way until a human at *this* supplier approves it, at `/approve/<token>`.
- **`janux verify` covers it** — the same command that checks descriptions and skills now checks the A2A surface: a card skill the app does not have is an error (it would mean the card stopped being derived), and so is a tool advertised to outside agents with no description.

```bash
bun install
bun run dev   # http://localhost:4341
```

## Hire it from a terminal

```bash
# What can it do?
curl -s http://localhost:4341/.well-known/agent-card.json | jq '.skills'

# An auto skill: the answer comes straight back
curl -s http://localhost:4341/_janux/a2a \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{
        "role":"ROLE_USER","messageId":"m1",
        "parts":[{"data":{"skill":"supplier.quote","input":{"sku":"MUG","units":12}}}]}}}'

# A guarded one: an input-required task, and nothing shipped
curl -s http://localhost:4341/_janux/a2a \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"SendMessage","params":{"message":{
        "role":"ROLE_USER","messageId":"m2",
        "parts":[{"data":{"skill":"supplier.ship","input":{"sku":"MUG","units":3}}}]}}}'
```

The reply carries a proposal token. Open `http://localhost:4341/approve/<token>` and approve it as a human — then `GetTask` with the task id shows `TASK_STATE_COMPLETED` and the shipment appears in this app's own log.

## Deploying it

Set `SUPPLIER_URL` to the public origin so the card advertises that instead of the origin each request happened to arrive on:

```bash
SUPPLIER_URL=https://supplier.example bun run start
```
