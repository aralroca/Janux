/**
 * One worker life for the SIGKILL test. First life: claims the due schedule,
 * starts the durable workflow, remembers the run id and hangs mid-run until
 * the test kills the process. Second life: the reopened claim hands back the
 * remembered run id and the handler resumes the same run to completion.
 */
import { createPgStorage } from '../pg-storage';
import { createScheduler, defineSchedule } from '../schedule';
import { createStep, createWorkflow, createWorkflowRunner } from '../workflow';

const URL = process.env.JANUX_TEST_PG ?? 'postgres://assistant:assistant@localhost:5432/janux_harness_test';
const NAME = process.env.JANUX_TEST_SCHEDULE ?? 'kill-proof';
const storage = await createPgStorage({ connectionString: URL });
const runner = createWorkflowRunner(storage);

const provision = createWorkflow<{ begun: number }>({
  id: 'kill-proof',
  initialState: () => ({ begun: 0 }),
  steps: [
    createStep({
      id: 'begin',
      run: ({ state }) => {
        state.begun += 1;
      },
    }),
    createStep({
      id: 'gate',
      run: ({ resumeData, suspend }) => {
        if (!resumeData) suspend({ waiting: true });
      },
    }),
  ],
});

async function firstLife(remember: (state: unknown) => Promise<void>): Promise<void> {
  const started = await runner.start(provision, {});

  await remember({ runId: started.runId });
  console.log(`CLAIMED ${started.runId}`);
  // In-flight work: hold the claim open until the test SIGKILLs this process.
  await new Promise(() => {});
}

async function secondLife(runId: string): Promise<void> {
  const finished = await runner.resume(provision, runId, 'go');

  console.log(`RESUMED ${JSON.stringify({ runId: finished.runId, status: finished.status, begun: finished.state.begun })}`);
}

const scheduler = createScheduler({
  storage,
  leaseMs: 1_500,
  schedules: {
    [NAME]: defineSchedule({
      cron: '* * * * *',
      run({ state, remember }) {
        const memory = state as { runId: string } | undefined;

        return memory ? secondLife(memory.runId) : firstLife(remember);
      },
    }),
  },
});

while ((await scheduler.tick()).length === 0) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await storage.close();
process.exit(0);
