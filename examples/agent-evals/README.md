# Agent evals — `janux eval` as the CI gate

A small warehouse manager whose real product is not the page: it is the **agent surface, gated in CI**. The scripted scenarios in `evals/` replay complete agent tasks over HTTP — no model, no API key — and `bunx janux eval` turns their outcome into an exit code.

- **Deterministic agent-task replay** — each `evals/*.eval.json` step is a real `POST /_janux/api/<tool>` with `x-janux-origin: agent`, so guards, validation and approvals are exercised exactly as an agent would hit them.
- **Mixed guards with a human in the loop** — `api.stock.levels` and `api.stock.restock` are `auto`; `api.stock.discard` is `confirm`, so the write-off eval asserts the proposal, approves it via `/_janux/approve` (`"approve": "$steps[0].result.id"`), verifies the state change, and proves a replayed approval finds nothing (404).
- **Rejection is a first-class outcome** — `evals/reject.eval.json` proposes a write-off, rejects it via `/_janux/reject` (`"reject": "$steps[0].result.id"`), and proves the stock untouched with `$some`/`$not` matchers, the proposal's `discarded` field `"$absent"`, and the settled id unapprovable (404).
- **Validation as part of the contract** — `evals/validation.eval.json` asserts that malformed input answers a structured `400` naming the offending field, even on the `confirm`-guarded tool — and that a business `throw` inside `run()` answers `500` with `"Error: …"`.
- **Isolation on demand** — `evals/write-off.eval.json` carries `"reset": true`, so under `--start` the app reboots before it and the scenario always starts from seed stock.
- **A canary that must fail** — `broken-evals/skip-approval.eval.json` (outside the `evals/` glob on purpose) expects a write-off to execute without approval; the e2e suite runs it and asserts a non-zero exit. Green means something because red is proven reachable.
- **A gate that only reddens on reproducible failures** — with `--trials 2` a scenario blocks CI only when it fails *every* trial; the verdict on stderr (and in `eval-gate.json`) says which scenario regressed and where. A gate that turns red on its own is a gate people learn to ignore.
- **Run history and baseline** — each run is appended to `.janux/evals/history.jsonl` (commit, model, date, per-scenario passes, usage), and the end of every run says what improved, what regressed and what it cost vs the previous run or an explicit `--baseline` file.
- **`janux verify`** — the description contract: every agent-reachable tool must say when to use it, or CI fails before any eval runs.

```bash
bun install
bun run dev   # http://localhost:4321
bunx janux verify
bunx janux eval --json
```

`janux eval` needs a running app (`--url`, default `http://localhost:3000`) or boots one itself with `--start`. That second form is the CI shape:

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
      - run: bunx janux eval --json --trials 2 --start "bunx janux start --port 3000" --url http://localhost:3000
```

The guard that makes the write-off eval interesting is one line in the tool definition — remove it and `evals/write-off.eval.json` fails while the canary starts passing:

```ts
import { api } from '@janux/server';
import { schema, str, int } from 'janux';

export const discard = api({
  description:
    'Write off units of a SKU (damaged, expired, lost). Destroys stock permanently — ' +
    'an agent call becomes a proposal a human approves.',
  input: schema({ sku: str(), qty: int().min(1), reason: str().min(3) }),
  output: schema({ sku: str(), discarded: int(), stock: int() }),
  guard: 'confirm',
  run: ({ input }) => ({ sku: input.sku, discarded: input.qty, stock: 0 }),
});
```

## Where things live

| File | What it shows |
|---|---|
| `src/server/stock.api.ts` | The agent surface: `levels`/`restock` (`auto`) and `discard` (`confirm`), seeded in memory so evals are deterministic |
| `src/components/Stockroom.tsx` | The human face: same tools behind buttons, write-off `confirm`-guarded on the island too |
| `src/routes/index.tsx` | The page mounting the island |
| `evals/restock.eval.json` | An `auto` task end to end: read, mutate, verify the resulting state |
| `evals/write-off.eval.json` | The approval flow: proposal → untouched state → approve → new state → consumed proposal; `"reset": true` isolates it |
| `evals/reject.eval.json` | The rejection flow: proposal → reject → stock untouched (`$some`, `$not`, `"$absent"`) → id settled for good |
| `evals/validation.eval.json` | Structured `400`s for bad input, and the `500` `"Error: …"` shape of a business `throw` |
| `broken-evals/skip-approval.eval.json` | The must-fail canary proving the gate detects regressions |
| `../../e2e/agent-evals.e2e.test.ts` | The repo's own CI wiring: runs the gate, the canary, and the shop's evals |
