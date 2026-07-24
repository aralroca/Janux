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

```yaml
# .github/workflows/agent-surface.yml
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

`--start` boots the app, waits for it, runs every scenario and stops it; the exit code is the gate. This is the layer that catches a renamed tool, a broken guard, a validation regression or an approval flow that stopped working.

## Layer 3 — a real model, nightly, never gating

What layers 1–2 cannot tell you: whether a model reading your `description` fields picks the right tool with the right input. That is a property of your *prose*, and it's worth measuring — but it costs tokens and it is **not deterministic**.

Point it at a live app and assert **what changed**, never what the model said:

```ts
import { describe, expect, it } from 'bun:test';

const BASE = process.env.EVAL_URL ?? 'http://localhost:3000';
const ask = async (prompt: string, path: string) => {
  const response = await fetch(`${BASE}/_janux/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], path }),
  });

  return response.json() as any;
};

const OFFLINE = !process.env.OPENROUTER_API_KEY || !process.env.EVAL_URL;

describe.skipIf(OFFLINE)('the model can drive the cart', () => {
  it('picks cart.addItem with the quantity the user asked for', async () => {
    const body = await ask('Add two units of product p1 to my cart.', '/shop');

    expect(body.type).toBe('ui_calls');
    expect(body.calls[0]).toMatchObject({ name: 'cart.addItem', input: { productId: 'p1', qty: 2 } });
  });

  it('cannot pay unattended: a confirm guard comes back as a proposal', async () => {
    const body = await ask('Pay the cart total of 5999 cents.', '/shop');
    const results = (body.messages ?? []).filter((message: any) => message.role === 'tool');

    // A tool message carries its result as a JSON *string* — parse it, don't grep it.
    expect(JSON.parse(results[0].content)).toMatchObject({ status: 'proposal', tool: 'shop.pay' });
  });
});
```

`describe.skipIf` is what keeps this file honest: gate it on **both** the key and the live URL, and on a PR, on a fork, or on any machine without them it skips instead of failing. A working example lives at [`examples/shop/model-evals`](https://github.com/aralroca/Janux/tree/main/examples/shop/model-evals).

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

```yaml
# .github/workflows/model-evals.yml
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
      - run: bun test model-evals
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          JANUX_MODEL: openrouter/google/gemini-2.5-flash-lite
          EVAL_URL: http://localhost:3000
```

## Why layer 3 earns its keep anyway

The first real-model run against the shop example asked it to pay, and it answered *"I've paid 5999 cents and your order ID is ord_j85u9s"* — for an `api()` declared `guard: 'confirm'`. The deterministic eval in layer 2 was green, because the HTTP door implemented the confirm gate correctly; the copilot loop (and the hosted MCP endpoint) called a different seam that didn't. One prompt found a human-in-the-loop bypass that a green test suite had not.

That's the trade: layer 2 protects the contract you already know about, layer 3 occasionally tells you the contract has a door you forgot.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Intents and guards](/docs/guide/intents-and-guards) · [CLI](/docs/reference/cli) · [External MCP clients](/docs/recipes/external-mcp-clients)
