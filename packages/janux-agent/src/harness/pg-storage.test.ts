import { afterAll, describe, expect, it } from 'bun:test';
import { createMemory } from './memory';
import { createPgStorage } from './pg-storage';
import { createStep, createWorkflow, createWorkflowRunner } from './workflow';

const URL = process.env.JANUX_TEST_PG ?? 'postgres://assistant:assistant@localhost:5432/janux_harness_test';
// Bun reports a refused connection as ConnectionRefused/"Unable to connect" (no ECONNREFUSED).
const reachable = await fetch('http://localhost:5432').catch((error) =>
  /ECONNREFUSED|ConnectionRefused|Unable to connect/i.test(`${error?.code ?? ''} ${error.cause ?? error}`) ? undefined : 'up',
);

// Runs only when the local stack is up (didit-ai-assistant docker compose).
const suite = reachable === undefined ? describe.skip : describe;

const storage = reachable === undefined ? undefined : await createPgStorage({ connectionString: URL });

afterAll(async () => {
  await storage?.close();
});

suite('pg storage adapter (real Postgres)', () => {
  it('persists threads/messages and honors the history window', async () => {
    const memory = createMemory({ storage: storage!, lastMessages: 2 });
    const thread = await memory.ensureThread(undefined, `res_${Date.now()}`);

    await memory.remember(thread, 'user', 'uno');
    await memory.remember(thread, 'assistant', 'dos');
    await memory.remember(thread, 'user', 'tres');
    const history = await memory.history(thread.id);

    expect(history.map((message) => message.content)).toEqual(['dos', 'tres']);
    await memory.deleteThread(thread.id);
    expect(await storage!.getThread(thread.id)).toBeUndefined();
  });

  it('workflow snapshots survive across runner instances (durable resume)', async () => {
    const wf = createWorkflow<{ hits: number }>({
      id: 'pg-durable',
      initialState: () => ({ hits: 0 }),
      steps: [
        createStep({
          id: 'one',
          run: ({ state, resumeData, suspend }) => {
            state.hits += 1;
            if (!resumeData) suspend({ ask: 'continue?' });
          },
        }),
      ],
    });
    const first = await createWorkflowRunner(storage!).start(wf, {});

    expect(first.status).toBe('suspended');
    const resumed = await createWorkflowRunner(storage!).resume(wf, first.runId, 'yes');

    expect(resumed.status).toBe('done');
    expect(resumed.state.hits).toBe(2);
  });
});
