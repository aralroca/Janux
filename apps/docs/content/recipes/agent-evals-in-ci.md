---
title: Agent evals in CI
description: '"Can an agent actually complete this task through my tools?" splits into three questions with three different costs.'
---

# Agent evals in CI

"Can an agent actually complete this task through my tools?" splits into three questions with three different costs. Only the last one needs an API key, and it's the only one that shouldn't gate a merge.

| Layer | What it answers | Model | Deterministic | Runs on |
|---|---|---|---|---|
| Unit | Does my loop wire tools, guards and proposals correctly? | scripted | yes | every PR |
| `janux verify` + `janux eval` | Does the real agent surface behave over HTTP? | none | yes | every PR |
| Model in the loop | Does a real model *choose* the right tools from my descriptions? | real | **no** | nightly |

## Layer 1 — unit tests with a scripted model

The agent loop takes its `fetch` as an override, so a test can script what the provider "replies" and assert what the loop does with it. No network, no key, microseconds:

```ts
import { defineAgent } from '@janux/agent';
import { api, createJanuxServer } from '@janux/server';
import { schema, str } from 'janux';

/** One canned provider response — the blocks a model would have returned. */
export const reply = (content: unknown[]) =>
  new Response(JSON.stringify({ content, model: 'claude-sonnet-5' }), {
    headers: { 'content-type': 'application/json' },
  });

export function scriptedServer(replies: Response[]) {
  const fetchImpl = (async () => replies.shift()!) as typeof fetch;

  return createJanuxServer({
    apis: { shop: { search: api({ input: schema({ q: str() }), run: ({ input }) => [`found:${input.q}`] }) } },
    agent: defineAgent({}, { env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl }),
  });
}
```

Then script a turn and assert what the loop did with it — note the wire name: dots become `__`, because that's what tool-name grammars allow.

```ts
const server = scriptedServer([
  reply([{ type: 'tool_use', id: 't1', name: 'api__shop__search', input: { q: 'shoes' } }]),
  reply([{ type: 'text', text: 'Found 1 result' }]),
]);
const body = await (await server.fetch(agentRequest('find shoes'))).json();

expect(body.type).toBe('text');
expect(JSON.stringify(body.messages)).toContain('found:shoes');   // the tool really ran
```

Feed it a `tool_use` block and assert the loop executed the tool and continued; feed it a `confirm`-guarded tool and assert you got a **proposal** instead of an execution. That's the layer where guards, approvals, refusals, rate limits and turn limits belong.

## Layer 2 — the CI gate: `verify` + `eval`

Both commands are deterministic and need **no secrets**.

`janux verify` renders every route's manifest and fails when an agent-reachable tool has no `description` — the contract a model plans against:

```bash
janux verify
# janux verify: agent surface OK — every reachable tool has a description.
```

`janux eval` runs `evals/**/*.eval.json` against a live app. Each step is a real HTTP call to `/_janux/api/<tool>` with `x-janux-origin: agent`, so guards, validation and the human-approval flow are exercised for real — with no model anywhere in the path:

```jsonc
{
  "name": "shop agent checkout",
  "steps": [
    { "tool": "api.shop.catalog", "expect": { "result": { "products": [{ "id": "p1" }] } } },
    { "tool": "api.shop.pay", "input": { "total": 5999 },
      "expect": { "result": { "status": "proposal", "tool": "shop.pay" } } },
    { "approve": "$steps[1].result.id", "expect": { "result": { "charged": 5999 } } },
    { "tool": "api.shop.pay", "input": { "total": "not-money" },
      "expect": { "ok": false, "status": 400, "error": "total" } }
  ]
}
```

```yaml title=".github/workflows/agent-surface.yml"
name: agent surface
on: [push, pull_request]

jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bunx janux verify
      - run: bunx janux eval --start "bunx janux start --port 3000"
```

`--start` boots the app, waits for it, runs every scenario and stops it; the exit code is the gate. This is the layer that catches a renamed tool, a broken guard, a validation regression or an approval flow that stopped working. Scenario files run sorted by filename — the gate's order is deterministic — and with `--json` the booted app's stdout is silenced, so the report is the only thing on stdout and a CI step can pipe it straight into `jq`.

### The expect language, beyond happy paths

Positional array matching is fragile when order is an implementation detail. `{ "$some": {…} }` passes when *any* item matches, `{ "$not": {…} }` inverts a match, and the value `"$absent"` asserts a field is missing — so you can state what must **not** have happened. `$some` and `$not` are single-key wrappers; never mix them with literal keys in the same object.

A proposal is settled by a human one of two ways, and both deserve a scenario: `approve` executes it, `reject` (`POST /_janux/reject`) discards it. Reject answers `{ "ok": true }` when the proposal existed, `{ "ok": false }` (status 200) once it is gone — and a rejected proposal must be unapprovable afterwards:

```jsonc
{
  "name": "rejected write-off leaves stock untouched",
  "steps": [
    { "tool": "api.stock.discard", "input": { "sku": "CABLE", "qty": 5, "reason": "miscounted" },
      "expect": { "result": { "status": "proposal", "discarded": "$absent" } } },
    { "reject": "$steps[0].result.id", "expect": { "ok": true } },
    { "tool": "api.stock.levels",
      "expect": { "result": { "items": { "$some": { "sku": "CABLE", "stock": 120 } } } } },
    { "tool": "api.stock.levels",
      "expect": { "result": { "items": { "$not": { "$some": { "sku": "CABLE", "stock": 115 } } } } } },
    { "approve": "$steps[0].result.id", "expect": { "ok": false, "status": 404 } }
  ]
}
```

Business errors are part of the contract too. A `throw` inside a tool's `run()` reaches the wire as `{ "ok": false, "error": "Error: <message>" }` with status **500** (schema validation is `400`, a forbidden guard `403`), so an eval can pin it down:

```jsonc
{ "tool": "api.stock.restock", "input": { "sku": "GHOST", "qty": 5 },
  "expect": { "ok": false, "status": 500, "error": "Error: Unknown SKU" } }
```

Scenarios share one live app on purpose — a checkout that builds on the catalog eval's state is realistic. When a scenario must not inherit state, give it `"reset": true`: `janux eval` reboots the `--start` app before running it, so it starts from seed (without `--start` there is nothing to reboot and the flag is ignored).

## Layer 3 — a real model, nightly, never gating

What layers 1–2 cannot tell you: whether a model reading your `description` fields picks the right tool with the right input. That is a property of your *prose*, and it's worth measuring — but it costs tokens and it is **not deterministic**.

It needs a key and a running server, so it is **not** part of the default suite — a test that can only ever skip is noise. Make it a script you run on purpose, point it at a live app, and assert **what changed**, never what the model said:

```ts title="model-evals/run.ts"
const BASE = process.env.EVAL_URL;
const KEY = process.env.OPENROUTER_API_KEY;

if (!BASE || !KEY) {
  console.error('model-evals: needs EVAL_URL and a provider API key.');
  process.exit(1);           // missing inputs are a failure, never a silent pass
}

const ask = async (prompt: string, path: string) => {
  const response = await fetch(`${BASE}/_janux/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], path }),
  });

  return response.json() as any;
};

/** A tool result travels as a JSON *string* — parse it, don't grep it. */
const toolResults = (body: any): any[] =>
  (body.messages ?? []).filter((message: any) => message.role === 'tool').map((message: any) => JSON.parse(message.content));

async function picksTheRightTool(): Promise<boolean> {
  const body = await ask('Add two units of product p1 to my cart.', '/shop');

  return body.type === 'ui_calls' && body.calls[0]?.name === 'cart.addItem' && body.calls[0]?.input?.qty === 2;
}

async function cannotPayUnattended(): Promise<boolean> {
  const body = await ask('Pay the cart total of 5999 cents.', '/shop');

  return toolResults(body).some((result) => result.status === 'proposal' && result.tool === 'shop.pay');
}
```

Run the scenarios, print a line each, and exit non-zero if any failed — that exit code is all the nightly workflow needs.

A working runner lives at [`examples/shop/model-evals`](https://github.com/aralroca/Janux/tree/main/examples/shop/model-evals). If you'd rather keep these inside your test suite, wrap them in `describe.skipIf(!process.env.OPENROUTER_API_KEY || !process.env.EVAL_URL)` so a PR, a fork or a laptop without the key skips instead of failing — just know that every green run then hides a skip.

### Two things the shape above is built around

**UI tools don't execute headlessly.** `api.*` tools run server-side inside the loop, so their effects are observable in the app's state. Anything else — an island's intents — comes back as `{ type: 'ui_calls', calls: [...] }` for a browser to perform. That's not a limitation to work around: asserting *which* `ui_calls` the model chose is a sharper test of your descriptions than checking a DOM afterwards.

**The same prompt does not give the same answer.** Measured on [`examples/shop`](https://github.com/aralroca/Janux/tree/main/examples/shop) with `openrouter/google/gemini-2.5-flash-lite`: "Which products are in the catalog?" called `api.shop.catalog` on one run and answered with no tool call at all on the next; "Add two units of p1" produced the `cart.addItem` call once and plain prose the time before. Nothing about the app changed between runs.

So:

- **never gate merges on it.** Nightly `schedule` plus `workflow_dispatch`, and a red run is a signal to read, not a build to fix.
- **assert capability, not text.** Goal state, or the tool call and its input.
- **retry before believing a failure**, and treat the pass rate over time as the metric:

```ts
/** Capability, not single-shot: a model may miss once. Three tries, then believe it. */
async function eventually(attempt: () => Promise<boolean>, tries = 3): Promise<boolean> {
  for (let attempted = 0; attempted < tries; attempted += 1) {
    if (await attempt()) return true;
  }

  return false;
}
```

- **cap the cost**: a small model, `maxTurns`, a handful of scenarios.

### What a red run is actually telling you

Usually: *your description is not doing its job.* The catalog miss above was not a model defect — the tool said what it **was** ("List products with prices (minor units)") instead of when to reach for it. Rewritten to say so:

```ts
description:
  'List every product in the store with its id, name and price (minor units). ' +
  'Call this before answering any question about products, prices or availability — never answer from memory.',
```

…the same prompt called the tool on **5 of 5 runs**. That is the loop this layer buys you: a red nightly, a sharper description, a measurable change. Layers 1–2 cannot see it, because a scripted model always calls exactly what you scripted.

```yaml title=".github/workflows/model-evals.yml"
name: model evals
on:
  schedule: [{ cron: '0 4 * * *' }]
  workflow_dispatch:

jobs:
  model:
    runs-on: ubuntu-latest
    if: github.repository == 'you/your-app'      # never on forks
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bunx janux start --port 3000 &
      - run: bun model-evals/run.ts
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          JANUX_MODEL: openrouter/google/gemini-2.5-flash-lite
          EVAL_URL: http://localhost:3000
```

## Why layer 3 earns its keep anyway

The first real-model run against the shop example asked it to pay, and it answered *"I've paid 5999 cents and your order ID is ord_j85u9s"* — for an `api()` declared `guard: 'confirm'`. The deterministic eval in layer 2 was green, because the HTTP door implemented the confirm gate correctly; the copilot loop (and the hosted MCP endpoint) called a different seam that didn't. One prompt found a human-in-the-loop bypass that a green test suite had not.

That's the trade: layer 2 protects the contract you already know about, layer 3 occasionally tells you the contract has a door you forgot.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Intents and guards](/docs/guide/intents-and-guards) · [CLI](/docs/reference/cli) · [External MCP clients](/docs/recipes/external-mcp-clients)
