import { api } from '@janux/server';
import { int, list as listOf, schema, str } from 'janux';
import { callSkill, discover, readTask, supplierOrigin } from './a2a-client';

/**
 * The buyer's own agent surface. Every one of these is an A2A *client* call to
 * the supplier — so this app is simultaneously an agent to whoever uses it and
 * a caller of somebody else's agent, which is the whole shape of the agentic
 * web in one example.
 */

const APPROVE_PATH = '/approve/';

/** What the supplier's parked task tells the buyer: the token, and where a human settles it. */
function pending(task: { id: string; status: { message?: { parts: { data?: any }[] } } }) {
  const data = (task.status.message?.parts ?? []).map((part) => part.data).find((value) => value?.proposal);

  return {
    taskId: task.id,
    state: 'awaiting-approval',
    tool: String(data?.tool ?? ''),
    approveAt: `${supplierOrigin()}${APPROVE_PATH}${data?.proposal ?? ''}`,
  };
}

export const supplierCard = api({
  description: "Read the supplier's A2A agent card: who it is and which skills it offers.",
  output: schema({ name: str(), description: str(), skills: listOf({ id: str(), description: str(), tags: str() }) }),
  run: async () => {
    const card = await discover();

    return {
      name: card.name,
      description: card.description,
      skills: card.skills.map((skill) => ({ ...skill, tags: skill.tags.join(', ') })),
    };
  },
});

export const priceCheck = api({
  description: 'Ask the supplier what an order would cost. Reserves nothing.',
  input: schema({ sku: str().min(3).max(3).default('MUG'), units: int().min(1).max(500).default(12) }),
  output: schema({ total: int(), unitPrice: int() }),
  run: async ({ input }) => {
    const task = await callSkill('supplier.quote', input);

    if (task.status.state !== 'TASK_STATE_COMPLETED') throw new Error(`Supplier answered ${task.status.state}`);

    return task.artifacts![0]!.parts[0]!.data as { total: number; unitPrice: number };
  },
});

/**
 * The interesting one. This app is allowed to *ask*; the supplier's `confirm`
 * guard is what decides. The reply is an `input-required` task, and the only
 * honest thing to do with it is show the human where it is waiting.
 */
export const order = api({
  description: 'Ask the supplier to ship units of a sku. The supplier parks it for one of its humans to approve.',
  input: schema({ sku: str().min(3).max(3).default('MUG'), units: int().min(1).max(500).default(12) }),
  output: schema({ taskId: str(), state: str(), tool: str(), approveAt: str() }),
  run: async ({ input }) => {
    const task = await callSkill('supplier.ship', input);

    if (task.status.state === 'TASK_STATE_INPUT_REQUIRED') return pending(task);
    throw new Error(`Supplier answered ${task.status.state} — expected a proposal`);
  },
});

export const orderStatus = api({
  description: 'Poll a parked order: still waiting, shipped, or rejected by the supplier.',
  input: schema({ taskId: str().min(1) }),
  output: schema({ state: str(), detail: str() }),
  run: async ({ input }) => {
    const task = await readTask(input.taskId);
    const shipped = task.artifacts?.[0]?.parts[0]?.data;

    return { state: task.status.state, detail: shipped ? JSON.stringify(shipped) : '' };
  },
});
