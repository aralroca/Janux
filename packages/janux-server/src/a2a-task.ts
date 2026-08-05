/**
 * A2A tasks (spec §4.1): the shapes this endpoint answers with, and the one
 * piece of state it keeps.
 *
 * An `api()` call is synchronous — it ran, or it refused — so almost every task
 * here is born terminal and is handed back in the same reply, statelessly, like
 * the MCP endpoint next door. The exception is the one Janux cares most about:
 * a `confirm` guard parks the call until a human settles it, which is precisely
 * A2A's `input-required`. That task outlives the request, so it is remembered
 * until the proposal it mirrors is approved or rejected — and no longer.
 */

export type TaskState =
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_CANCELED';

export interface Part {
  text?: string;
  data?: unknown;
}

export interface Task {
  id: string;
  contextId: string;
  status: { state: TaskState; timestamp: string; message?: unknown };
  artifacts?: { artifactId: string; name: string; parts: Part[] }[];
}

/** A parked `confirm` call, as much of it as rebuilding its task needs. */
export interface ParkedTask {
  contextId: string;
  tool: string;
  input: unknown;
  /** The token that settles it — the caller already has it; this is what re-polling shows. */
  proposal: string;
  outcome?: { ok: true; result: unknown } | { ok: false };
}

/** A fresh id for a task, an artifact or a message — the protocol only asks that it be unique. */
export const freshId = (): string => crypto.randomUUID();

const stamp = (): string => new Date().toISOString();

function agentMessage(parts: Part[]): unknown {
  return { role: 'ROLE_AGENT', messageId: freshId(), parts };
}

export function completedTask(id: string, contextId: string, name: string, part: Part): Task {
  return {
    id,
    contextId,
    status: { state: 'TASK_STATE_COMPLETED', timestamp: stamp() },
    artifacts: [{ artifactId: freshId(), name, parts: [part] }],
  };
}

/**
 * A refusal is a finished task, not a protocol error: the request was
 * well-formed and the pipeline answered it — with "no". Same call as MCP's
 * `isError` result, so the two surfaces refuse in the same words.
 */
export function failedTask(id: string, contextId: string, error: unknown): Task {
  return {
    id,
    contextId,
    status: { state: 'TASK_STATE_FAILED', timestamp: stamp(), message: agentMessage([{ text: String(error) }]) },
  };
}

const WAITING = (tool: string) =>
  `"${tool}" is guarded by guard: 'confirm' — nothing ran. A human approves the parked proposal, then this task completes.`;

/** The parked task, rebuilt from the record: the same answer on the reply and on every later poll. */
export function taskOf(id: string, record: ParkedTask): Task {
  const { contextId, tool, input, proposal, outcome } = record;

  if (outcome?.ok) return completedTask(id, contextId, tool, { data: outcome.result });
  if (outcome) return { id, contextId, status: { state: 'TASK_STATE_CANCELED', timestamp: stamp() } };

  return {
    id,
    contextId,
    status: {
      state: 'TASK_STATE_INPUT_REQUIRED',
      timestamp: stamp(),
      message: agentMessage([{ text: WAITING(tool) }, { data: { tool, input, proposal, approve: '/_janux/approve' } }]),
    },
  };
}

/**
 * Bounded like the proposal vault it shadows: a task nobody polls must not keep
 * an app's memory, and the proposal behind it expires anyway.
 */
const MAX_TASKS = 100;

export function createTaskStore(max = MAX_TASKS) {
  const tasks = new Map<string, ParkedTask>();

  return {
    park(id: string, task: ParkedTask): void {
      const oldest = tasks.keys().next().value;

      if (tasks.size >= max && oldest) tasks.delete(oldest);
      tasks.set(id, task);
    },
    get: (id: string): ParkedTask | undefined => tasks.get(id),
    /**
     * What the approve/reject endpoints report back, addressed by the bare
     * proposal id they hold — the task id itself is a different string, handed
     * only to the agent that parked the call, so an id read off a log or a span
     * still buys nothing.
     */
    settle(proposalId: string, outcome: ParkedTask['outcome']): void {
      const record = [...tasks.values()].find((task) => task.proposal.split('.')[0] === proposalId);

      if (record) record.outcome = outcome;
    },
  };
}
