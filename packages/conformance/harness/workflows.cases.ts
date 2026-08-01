import { createMemoryStorage, createStep, createWorkflow, createWorkflowRunner, type HarnessStorage } from '@janux/agent';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Durable workflows: a step suspends, a human answers minutes later, and the
 * run continues — possibly in another process.
 *
 * So the rows that matter are about what survives the gap: the state, the step
 * to come back to, and nothing else. A callable cannot be snapshotted, which is
 * why `requestContext` is re-supplied per call rather than stored; a run id
 * that two processes could mint at once would let one run overwrite another's
 * snapshot; and a finished run must leave nothing behind to resume.
 */

interface Interview {
  answers: string[];
}

const ask = (id: string, question: string) =>
  createStep<Interview>({
    id,
    run({ state, resumeData, suspend }) {
      if (resumeData === undefined) return suspend({ question });
      state.answers.push(String(resumeData));
    },
  });

const interview = createWorkflow<Interview>({
  id: 'interview',
  initialState: (input) => ({ answers: [String((input as { seed?: string }).seed ?? 'none')] }),
  steps: [ask('name', 'Your name?'), ask('role', 'Your role?')],
});

const straight = createWorkflow<{ log: string[] }>({
  id: 'straight',
  initialState: () => ({ log: [] }),
  steps: [
    createStep({ id: 'one', run: ({ state }) => void (state as { log: string[] }).log.push('one') }),
    createStep({ id: 'two', run: ({ state }) => void (state as { log: string[] }).log.push('two') }),
  ],
});

const contextual = createWorkflow<{ seen: string[] }>({
  id: 'contextual',
  initialState: () => ({ seen: [] }),
  steps: [
    createStep({
      id: 'read',
      run({ state, resumeData, suspend, requestContext }) {
        (state as { seen: string[] }).seen.push(String((requestContext.caller as string) ?? 'nobody'));
        if (resumeData === undefined) suspend({ ask: 'again' });
      },
    }),
  ],
});

const runnerOn = (storage: HarnessStorage = createMemoryStorage()) => ({ runner: createWorkflowRunner(storage), storage });

export const WORKFLOW_CASES: ScenarioCase[] = [
  // ── running to the end ──────────────────────────────────────────────────────
  {
    id: 'harness2-workflow-a-run-with-nothing-to-ask-finishes-on-the-first-call',
    src: 'mastra:workflow#run',
    run: async (log) => {
      const { runner } = runnerOn();
      const result = await runner.start(straight, {});

      log.push(`${result.status} ${result.state.log.join(',')}`);
    },
    expected: ['done one,two'],
  },
  {
    id: 'harness2-workflow-steps-run-in-the-declared-order',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();

      log.push((await runner.start(straight, {})).state.log.join(' then '));
    },
    expected: ['one then two'],
  },
  {
    id: 'harness2-workflow-a-finished-run-carries-no-question',
    src: 'janux',
    run: async (log) => void log.push(`payload=${String((await runnerOn().runner.start(straight, {})).suspendPayload)}`),
    expected: ['payload=undefined'],
  },
  {
    id: 'harness2-workflow-a-workflow-with-no-steps-is-done-immediately',
    src: 'janux',
    run: async (log) => {
      const empty = createWorkflow<{ n: number }>({ id: 'empty', initialState: () => ({ n: 1 }), steps: [] });

      log.push((await runnerOn().runner.start(empty, {})).status);
    },
    expected: ['done'],
  },
  {
    id: 'harness2-workflow-the-initial-state-is-built-from-the-input',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();

      log.push((await runner.start(interview, { seed: 'from-input' })).state.answers.join(','));
    },
    expected: ['from-input'],
  },
  {
    id: 'harness2-workflow-a-finished-run-leaves-no-snapshot-to-resume',
    src: 'janux',
    run: async (log) => {
      const { runner, storage } = runnerOn();
      const { runId } = await runner.start(straight, {});

      log.push(`snapshot=${String(await storage.loadSnapshot(runId))}`);
    },
    expected: ['snapshot=undefined'],
  },

  // ── suspending and resuming ─────────────────────────────────────────────────
  {
    id: 'harness2-workflow-a-step-that-asks-something-suspends-the-run',
    src: 'mastra:workflow#suspend',
    run: async (log) => {
      const result = await runnerOn().runner.start(interview, {});

      log.push(`${result.status} ${JSON.stringify(result.suspendPayload)}`);
    },
    expected: ['suspended {"question":"Your name?"}'],
  },
  {
    id: 'harness2-workflow-a-suspended-run-is-snapshotted-under-its-id',
    src: 'janux',
    run: async (log) => {
      const { runner, storage } = runnerOn();
      const { runId } = await runner.start(interview, {});
      const snapshot = (await storage.loadSnapshot(runId)) as { workflowId: string; status: string; stepIndex: number };

      log.push(`${snapshot.workflowId} ${snapshot.status} step=${snapshot.stepIndex}`);
    },
    expected: ['interview suspended step=0'],
  },
  {
    id: 'harness2-workflow-resuming-answers-the-step-that-asked',
    src: 'mastra:workflow#resume',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(interview, {});
      const resumed = await runner.resume(interview, started.runId, 'ada');

      log.push(`${resumed.status} ${JSON.stringify(resumed.suspendPayload)}`);
    },
    expected: ['suspended {"question":"Your role?"}'],
  },
  {
    id: 'harness2-workflow-the-answer-is-kept-in-the-state-across-the-gap',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(interview, { seed: 'seed' });
      const afterFirstAnswer = (await runner.resume(interview, started.runId, 'ada')).state.answers.join(',');
      const done = await runner.resume(interview, started.runId, 'engineer');

      log.push(`${afterFirstAnswer} | ${done.status} ${done.state.answers.join(',')}`);
    },
    expected: ['seed,ada | done seed,ada,engineer'],
  },
  {
    id: 'harness2-workflow-a-resume-answer-reaches-only-the-step-that-was-waiting',
    src: 'janux',
    run: async (log) => {
      const seen: unknown[] = [];
      const twice = createWorkflow<{ n: number }>({
        id: 'twice',
        initialState: () => ({ n: 0 }),
        steps: [
          createStep({
            id: 'first',
            run: ({ resumeData, suspend }) => {
              seen.push(`first:${String(resumeData)}`);
              if (resumeData === undefined) suspend({});
            },
          }),
          createStep({ id: 'second', run: ({ resumeData }) => void seen.push(`second:${String(resumeData)}`) }),
        ],
      });
      const { runner } = runnerOn();
      const started = await runner.start(twice, {});

      await runner.resume(twice, started.runId, 'answer');
      log.push(seen.join(' '));
    },
    expected: ['first:undefined first:answer second:undefined'],
  },
  {
    id: 'harness2-workflow-a-run-may-suspend-at-the-same-step-more-than-once',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(contextual, {}, { caller: 'first' });
      const resumed = await runner.resume(contextual, started.runId, 'go', { caller: 'second' });

      log.push(`${started.status} ${resumed.status} ${resumed.state.seen.join(',')}`);
    },
    expected: ['suspended done first,second'],
  },
  {
    id: 'harness2-workflow-the-request-context-is-supplied-per-call-not-stored',
    src: 'janux',
    run: async (log) => {
      const { runner, storage } = runnerOn();
      const started = await runner.start(contextual, {}, { caller: 'first', tool: () => 'not serializable' });

      log.push(`stored=${JSON.stringify(await storage.loadSnapshot(started.runId)).includes('caller')}`);
    },
    expected: ['stored=false'],
  },
  {
    id: 'harness2-workflow-a-resumed-run-forgets-the-context-of-the-call-that-started-it',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(contextual, {}, { caller: 'first' });
      const resumed = await runner.resume(contextual, started.runId, 'go');

      log.push(resumed.state.seen.join(','));
    },
    expected: ['first,nobody'],
  },
  {
    id: 'harness2-workflow-a-finished-run-cannot-be-resumed-again',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const { runId } = await runner.start(straight, {});
      const recorded: string[] = [];

      await attempt(recorded, 'resume', () => runner.resume(straight, runId, 'late'));
      log.push(recorded[0]!.replace(runId, '<the run that finished>'));
    },
    expected: ['resume:threw:unknown_run:<the run that finished>'],
  },
  {
    id: 'harness2-workflow-an-unknown-run-id-is-refused-by-name',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();

      await attempt(log, 'resume', () => runner.resume(interview, 'run_made_up', 'x'));
    },
    expected: ['resume:threw:unknown_run:run_made_up'],
  },
  {
    id: 'harness2-workflow-a-snapshot-may-not-be-resumed-by-a-different-workflow',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(interview, {});

      await attempt(log, 'resume', () => runner.resume(contextual, started.runId, 'x'));
    },
    expected: ['resume:threw:workflow_mismatch'],
  },
  {
    id: 'harness2-workflow-a-mismatched-resume-leaves-the-snapshot-intact',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(interview, {});

      await attempt(log, 'wrong', () => runner.resume(contextual, started.runId, 'x'));
      log.push((await runner.resume(interview, started.runId, 'ada')).state.answers.join(','));
    },
    expected: ['wrong:threw:workflow_mismatch', 'none,ada'],
  },

  // ── run ids and isolation ───────────────────────────────────────────────────
  {
    id: 'harness2-workflow-a-run-id-names-the-workflow-it-belongs-to',
    src: 'janux',
    run: async (log) => {
      const { runId } = await runnerOn().runner.start(interview, {});

      log.push(`shape=${/^run_interview_[0-9a-f-]{36}$/.test(runId)}`);
    },
    expected: ['shape=true'],
  },
  {
    id: 'harness2-workflow-two-runs-started-at-once-never-share-an-id',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const [first, second] = await Promise.all([runner.start(interview, {}), runner.start(interview, {})]);

      log.push(`distinct=${first.runId !== second.runId}`);
    },
    expected: ['distinct=true'],
  },
  {
    id: 'harness2-workflow-two-runs-of-one-workflow-keep-their-own-state',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const first = await runner.start(interview, { seed: 'a' });
      const second = await runner.start(interview, { seed: 'b' });

      await runner.resume(interview, first.runId, 'one');
      const resumed = await runner.resume(interview, second.runId, 'two');

      log.push(resumed.state.answers.join(','));
    },
    expected: ['b,two'],
  },
  {
    id: 'harness2-workflow-a-run-resumes-from-a-storage-another-process-wrote',
    src: 'janux',
    run: async (log) => {
      const storage = createMemoryStorage();
      const started = await createWorkflowRunner(storage).start(interview, { seed: 'shared' });
      // A different runner over the same storage: the restart the durability is for.
      const elsewhere = createWorkflowRunner(storage);

      log.push((await elsewhere.resume(interview, started.runId, 'ada')).state.answers.join(','));
    },
    expected: ['shared,ada'],
  },
  {
    id: 'harness2-workflow-a-step-that-throws-does-not-swallow-the-error',
    src: 'janux',
    run: async (log) => {
      const broken = createWorkflow<{ n: number }>({
        id: 'broken',
        initialState: () => ({ n: 0 }),
        steps: [
          createStep({
            id: 'boom',
            run: () => {
              throw new Error('step blew up');
            },
          }),
        ],
      });

      await attempt(log, 'start', () => runnerOn().runner.start(broken, {}));
    },
    expected: ['start:threw:step blew up'],
  },
  {
    id: 'harness2-workflow-a-step-that-throws-leaves-no-half-finished-snapshot',
    src: 'janux',
    run: async (log) => {
      const { runner, storage } = runnerOn();
      const broken = createWorkflow<{ n: number }>({
        id: 'broken2',
        initialState: () => ({ n: 0 }),
        steps: [
          createStep({
            id: 'boom',
            run: () => {
              throw new Error('step blew up');
            },
          }),
        ],
      });

      await attempt(log, 'start', () => runner.start(broken, {}));
      log.push(`snapshots=${JSON.stringify(await storage.loadSnapshot('any')) === undefined ? 0 : 1}`);
    },
    expected: ['start:threw:step blew up', 'snapshots=0'],
  },
  {
    id: 'harness2-workflow-an-async-step-is-awaited-before-the-next-one-starts',
    src: 'janux',
    run: async (log) => {
      const order: string[] = [];
      const slow = createWorkflow<{ n: number }>({
        id: 'slow',
        initialState: () => ({ n: 0 }),
        steps: [
          createStep({
            id: 'first',
            run: async () => {
              await Promise.resolve();
              order.push('first');
            },
          }),
          createStep({ id: 'second', run: () => void order.push('second') }),
        ],
      });

      await runnerOn().runner.start(slow, {});
      log.push(order.join(','));
    },
    expected: ['first,second'],
  },
  {
    id: 'harness2-workflow-the-suspended-payload-is-whatever-the-step-passed',
    src: 'janux',
    run: async (log) => {
      const asking = createWorkflow<{ n: number }>({
        id: 'asking',
        initialState: () => ({ n: 0 }),
        steps: [createStep({ id: 'q', run: ({ suspend }) => suspend({ card: 'approve', options: ['yes', 'no'] }) })],
      });

      log.push(JSON.stringify((await runnerOn().runner.start(asking, {})).suspendPayload));
    },
    expected: ['{"card":"approve","options":["yes","no"]}'],
  },
  {
    id: 'harness2-workflow-state-written-before-a-suspend-is-part-of-the-snapshot',
    src: 'janux',
    run: async (log) => {
      const { runner, storage } = runnerOn();
      const started = await runner.start(interview, { seed: 'kept' });
      const snapshot = (await storage.loadSnapshot(started.runId)) as { state: Interview };

      log.push(snapshot.state.answers.join(','));
    },
    expected: ['kept'],
  },
  {
    id: 'harness2-workflow-the-runner-answers-with-the-same-run-id-it-was-given',
    src: 'janux',
    run: async (log) => {
      const { runner } = runnerOn();
      const started = await runner.start(interview, {});
      const resumed = await runner.resume(interview, started.runId, 'ada');

      log.push(`same=${resumed.runId === started.runId}`);
    },
    expected: ['same=true'],
  },
];
