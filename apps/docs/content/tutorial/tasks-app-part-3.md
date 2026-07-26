# Tutorial 3/3 — The copilot, proposals and tests

The board works and persists. Time to let an agent drive it — safely.

## Turn on the copilot

```bash title=".env"
# either one:
JANUX_MODEL=anthropic/claude-fable-5
ANTHROPIC_API_KEY=sk-ant-...
```

Optionally give it a personality in `src/agent.ts`:

```ts title="src/agent.ts"
export default defineAgent({
  instructions:
    'You are this task app’s copilot. Use the tasks.* tools. ' +
    'clearDone needs human approval — propose it, never insist.',
});
```

That's the entire AI integration. The copilot's tools are your intents and apis; there is no tool file to write or keep in sync.

## Watch a guarded flow happen

Ask the copilot: *“add tasks for milk and bread, then clean up everything that's done”*.

1. `tasks.add` runs twice (guard `auto`) — the board updates live.
2. `tasks.clearDone` hits `guard: 'confirm'` → the copilot gets `{ status: 'proposal' }` and your UI shows Approve/Reject.
3. Nothing is deleted until **you** approve. Approval executes exactly once; the audit log remembers both the ask and the answer.

The starter's `AgentPanel` (150 lines you fully own) is not a chat: it's a live view of this page's agent surface — every tool with its guard, a generated example payload, `callTool` to invoke one *exactly as an agent would*, and the Approve/Reject pair when a `confirm` tool answers with a proposal. Its `approve`/`reject` intents are `guard: 'forbidden'` — human-only, so a model can never approve itself.

For the chat version, [`examples/shop`](https://github.com/aralroca/Janux/tree/main/examples/shop) has a `Copilot` island (174 lines) that POSTs `/_janux/agent`, walks the `ui_calls` the model returns through `window.janux.call`, and renders the same proposal card. Both are app code, not framework code: swap either for your own UI.

## Test it all without a browser

```ts title="src/components/TaskBoard.test.ts" {11}
import { createInstance } from 'janux';
import { TaskBoard } from './TaskBoard';

it('clearDone is a proposal for agents', async () => {
  let proposal;
  const board = createInstance(TaskBoard, { onProposal: (p) => (proposal = p) });

  await board.intents.add({ title: 'done thing' });
  await board.intents.toggle({ id: board.snapshot().tasks[0].id });

  const result = await board.intents.clearDone({}, { origin: 'agent' });

  expect(result.status).toBe('proposal');          // proposed…
  expect(board.snapshot().tasks).toHaveLength(1);  // …not applied
  await proposal.execute();                        // human approves
  expect(board.snapshot().tasks).toHaveLength(0);
});
```

`bun test` — no browser, no mocks of your own framework, the *same pipeline* production uses.

## Where to go next

- Poke the second face directly: `curl -s localhost:3000/_janux/manifest | jq`
- Drive it from outside: [External MCP clients](/docs/recipes/external-mcp-clients)
- Understand what resume is doing under you: [SSR and resumability](/docs/guide/ssr-and-resumability)
- Or just play: paste your TaskBoard into the [Playground](/playground) and call your own tools as the agent.
