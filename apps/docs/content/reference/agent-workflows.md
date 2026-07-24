# Durable workflows

Multi-step agent processes that **survive a restart**: each step's state is snapshotted to the same [storage adapter](/docs/reference/agent-memory) memory uses, so a run suspended waiting for a human resumes exactly where it stopped — in another process, hours later.

```ts
import { createWorkflow, createStep, createWorkflowRunner } from '@janux/agent';
```

## Defining one

```ts
const interview = createWorkflow({
  id: 'onboarding',
  initialState: (input) => ({ answers: {}, region: (input as any)?.region }),
  steps: [
    createStep({
      id: 'ask-region',
      run: ({ state, resumeData, suspend }) => {
        if (resumeData) {
          state.answers.region = resumeData;

          return;
        }
        suspend({ question: 'Which region do you operate in?' });
      },
    }),
    createStep({
      id: 'decide',
      run: ({ state, requestContext }) => {
        state.answers.decision = decide(state.answers, requestContext);
      },
    }),
  ],
});
```

`createWorkflow(def)` and `createStep(step)` are **identity functions** — they exist purely to give you inference on `TState`. `WorkflowDef` is `{ id, initialState(input), steps }`.

### The step bag

| Field | What it is |
|---|---|
| `state` | The run's state. Mutate it — it's what gets snapshotted |
| `resumeData` | What the caller passed to `resume()`. `undefined` on the first pass through the step |
| `suspend(payload)` | Stops the run here and surfaces `payload` to the caller |
| `requestContext` | Per-run context (auth, locale, org) handed in at `start`/`resume` |

The `if (resumeData) … else suspend(…)` shape is the whole human-in-the-loop pattern: the step runs twice, once to ask and once to record.

## Running it

```ts
const runner = createWorkflowRunner(storage);

const started = await runner.start(interview, { region: 'EU' }, { userId });
// { runId, status: 'suspended', state, suspendPayload: { question: '…' } }

const next = await runner.resume(interview, started.runId, 'Germany', { userId });
// advances from the suspending step; status: 'done' when the last step finishes
```

`RunResult` is `{ runId, status: 'suspended' | 'done', state, suspendPayload? }`. Both calls take the definition — `resume` needs it to replay the steps, and it refuses a run that belongs to another workflow (`workflow_mismatch`) or one storage has never seen (`unknown_run`). Between the two calls the run lives **only** in storage — with [`createPgStorage`](/docs/reference/agent-memory) a deploy, a crash or a different instance answering the next request all keep working, which is exactly what an in-memory conversation state cannot do.

## Where this fits

Use a workflow when a process has **stages with human checkpoints**: an onboarding interview, a compliance review, an approval chain. For a single guarded action, an intent with `guard: 'confirm'` is simpler — the proposal *is* the checkpoint ([intents and guards](/docs/guide/intents-and-guards)).

Snapshots are keyed by `runId` through `saveSnapshot`/`loadSnapshot`/`deleteSnapshot`, so any custom adapter implementing those three methods gets durability for free.

Related: [Agent memory & storage](/docs/reference/agent-memory) · [Agent rate limiting](/docs/reference/agent-rate-limit) · [The agent and your copilot](/docs/guide/agent-and-copilot)
