import { api } from '@janux/server';
import { bool, enums, int, list as listOf, schema, str } from 'janux';

const PLANS = ['starter', 'pro', 'enterprise'] as const;

const customer = { id: str(), name: str(), email: str(), plan: enums([...PLANS]) };

const SEED = [
  { id: 'cus_101', name: 'Ada Lovelace', email: 'ada@example.com', plan: 'pro' },
  { id: 'cus_102', name: 'Grace Hopper', email: 'grace@example.com', plan: 'enterprise' },
  { id: 'cus_103', name: 'Alan Turing', email: 'alan@example.com', plan: 'starter' },
];

// In-memory on purpose: every server boot starts from the same seed, so the
// scripted evals in evals/ are deterministic run after run. Swap for your
// database and keep the tool contracts identical.
const customers = SEED.map((entry) => ({ ...entry }));
const audit: { seq: number; actor: string; tool: string; detail: string }[] = [];
let nextId = 104;

/** One trail for both faces: the actor is the invocation origin, not a checkbox. */
function record(actor: string, tool: string, detail: string): void {
  audit.push({ seq: audit.length + 1, actor, tool, detail });
}

function customerById(id: string) {
  const found = customers.find((entry) => entry.id === id);

  if (!found) throw new Error(`Unknown customer "${id}"`);

  return found;
}

export const list = api({
  description:
    'List every customer with id, name, email and plan. ' +
    'Call this before answering any question about customers — never answer from memory.',
  output: schema({ customers: listOf(customer) }),
  run: () => ({ customers }),
});

export const create = api({
  description: 'Add a customer. Routine and reversible, so it executes immediately.',
  // Defaults are the example payload an agent (or the panel) starts from: a
  // plausible person, so "call it" is runnable without editing anything.
  input: schema({ name: str().min(1).default('Marie Curie'), email: str().min(3).default('marie@example.com'), plan: enums([...PLANS]).default('starter') }),
  output: schema(customer),
  run: ({ input, origin }) => {
    if (!input.email.includes('@')) throw new Error(`"${input.email}" is not an email address`);
    if (customers.some((entry) => entry.email === input.email)) throw new Error(`${input.email} already exists`);
    const added = { id: `cus_${nextId++}`, name: input.name, email: input.email, plan: input.plan };

    customers.push(added);
    record(origin, 'customers.create', `${added.name} (${added.plan})`);

    return added;
  },
});

export const update = api({
  description: 'Change the plan a customer is on. Routine and reversible, so it executes immediately.',
  input: schema({ id: str().default('cus_101'), plan: enums([...PLANS]) }),
  output: schema(customer),
  run: ({ input, origin }) => {
    const entry = customerById(input.id);

    entry.plan = input.plan;
    record(origin, 'customers.update', `${entry.name} → ${entry.plan}`);

    return entry;
  },
});

export const remove = api({
  description:
    'Delete a customer and everything they own. Irreversible: ' +
    'an agent call becomes a proposal a human settles via /_janux/approve.',
  input: schema({ id: str().default('cus_103'), reason: str().min(3).default('account closed by its owner') }),
  output: schema({ id: str(), removed: bool() }),
  guard: 'confirm',
  run: ({ input, origin }) => {
    const entry = customerById(input.id);

    customers.splice(customers.indexOf(entry), 1);
    record(origin, 'customers.remove', `${entry.name} — ${input.reason}`);

    return { id: entry.id, removed: true };
  },
});

export const trail = api({
  description: 'Every executed change, oldest first, with the actor (human or agent) that did it. Rejected proposals never appear here.',
  output: schema({ entries: listOf({ seq: int(), actor: str(), tool: str(), detail: str() }) }),
  run: () => ({ entries: audit }),
});
