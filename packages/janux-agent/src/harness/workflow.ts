import type { HarnessStorage } from './storage';

/**
 * Durable workflows (RFC 0002 §19): a step calls `suspend(payload)` and the
 * run snapshot persists keyed by run id — it survives restarts and resumes
 * from a different request/instance. Callables are never serialized; they are
 * re-supplied via a per-run `requestContext` on start/resume. The one-question-
 * per-suspend human-in-the-loop pattern is first-class.
 */

export interface StepDef<TState = any> {
  id: string;
  run(args: {
    state: TState;
    resumeData?: unknown;
    suspend(payload: unknown): void;
    requestContext: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface WorkflowDef<TState = any> {
  id: string;
  initialState(input: unknown): TState;
  steps: StepDef<TState>[];
}

interface Snapshot<TState = any> {
  workflowId: string;
  state: TState;
  stepIndex: number;
  status: 'suspended' | 'done';
  suspendPayload?: unknown;
}

export interface RunResult<TState = any> {
  runId: string;
  status: 'suspended' | 'done';
  state: TState;
  /** The payload the suspending step surfaced (e.g. the next interview question). */
  suspendPayload?: unknown;
}

export function createWorkflow<TState>(def: WorkflowDef<TState>) {
  return def;
}

export function createStep<TState>(step: StepDef<TState>): StepDef<TState> {
  return step;
}

async function advance<TState>(
  def: WorkflowDef<TState>,
  storage: HarnessStorage,
  runId: string,
  snapshot: Snapshot<TState>,
  resumeData: unknown,
  requestContext: Record<string, unknown>,
): Promise<RunResult<TState>> {
  let index = snapshot.stepIndex;
  let pendingResume = resumeData;

  while (index < def.steps.length) {
    let suspended: { payload: unknown } | undefined;
    const step = def.steps[index]!;

    await step.run({
      state: snapshot.state,
      resumeData: pendingResume,
      suspend: (payload) => {
        suspended = { payload };
      },
      requestContext,
    });
    pendingResume = undefined;
    if (suspended) {
      const next: Snapshot<TState> = {
        ...snapshot,
        stepIndex: index,
        status: 'suspended',
        suspendPayload: suspended.payload,
      };

      await storage.saveSnapshot(runId, next);

      return { runId, status: 'suspended', state: next.state, suspendPayload: suspended.payload };
    }
    index += 1;
  }
  await storage.deleteSnapshot(runId);

  return { runId, status: 'done', state: snapshot.state };
}

export function createWorkflowRunner(storage: HarnessStorage) {
  return {
    async start<TState>(
      def: WorkflowDef<TState>,
      input: unknown,
      requestContext: Record<string, unknown> = {},
    ): Promise<RunResult<TState>> {
      // Random, not sequential: two processes starting runs concurrently must
      // never mint the same id — the snapshot of one would overwrite the other.
      const runId = `run_${def.id}_${crypto.randomUUID()}`;
      const snapshot: Snapshot<TState> = {
        workflowId: def.id,
        state: def.initialState(input),
        stepIndex: 0,
        status: 'suspended',
      };

      return advance(def, storage, runId, snapshot, undefined, requestContext);
    },

    async resume<TState>(
      def: WorkflowDef<TState>,
      runId: string,
      resumeData: unknown,
      requestContext: Record<string, unknown> = {},
    ): Promise<RunResult<TState>> {
      const snapshot = (await storage.loadSnapshot(runId)) as Snapshot<TState> | undefined;

      if (!snapshot) throw new Error(`unknown_run:${runId}`);
      if (snapshot.workflowId !== def.id) throw new Error('workflow_mismatch');

      return advance(def, storage, runId, snapshot, resumeData, requestContext);
    },
  };
}

export type WorkflowRunner = ReturnType<typeof createWorkflowRunner>;
