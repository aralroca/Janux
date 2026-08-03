import { component, intent, source, onEvent, schema, str, enums, list } from 'janux';
import { list as roster, create, update, remove, trail } from '../server/customers.api';

let stopAudit: (() => void) | undefined;

const PLANS = ['starter', 'pro', 'enterprise'];

/** The next plan up, for the one-click upgrade button. Enterprise stays put. */
function planAfter(plan: string): string {
  return PLANS[Math.min(PLANS.indexOf(plan) + 1, PLANS.length - 1)]!;
}

function CustomerRow({ entry, intents }: { entry: any; intents: any }) {
  return (
    <tr key={entry.id}>
      <td>{entry.name}</td>
      <td class="email">{entry.email}</td>
      <td>
        <span class={`plan ${entry.plan}`}>{entry.plan}</span>
      </td>
      <td class="actions">
        {entry.plan !== 'enterprise' ? (
          <button onClick={intents.upgrade.with({ id: entry.id, plan: planAfter(entry.plan) })}>Upgrade</button>
        ) : null}
        <button class="danger" onClick={intents.remove.with({ id: entry.id })}>
          Remove
        </button>
      </td>
    </tr>
  );
}

export const CustomersDesk = component({
  name: 'desk',
  description: 'The customers desk: routine CRUD executes, deleting a customer waits for a human.',

  sources: {
    roster: source({
      description: 'Every customer on file',
      query: () => roster({}),
      refresh: onEvent('customers.changed'),
    }),
    trail: source({
      description: 'The audit trail: every executed change and who did it',
      query: () => trail({}),
      refresh: onEvent('customers.changed'),
    }),
  },

  emits: { 'customers.changed': schema({}) },

  /**
   * Agent-origin changes bypass this island's intents: a direct `api.*` call
   * from the panel, or an approval in the inbox, executes on the server and
   * never touches the emits above. Both DO land on `janux:audit` as the island
   * intent that carried them — refreshing on exactly those two keeps the
   * roster and the trail live for both faces, and on nothing else, so a
   * refresh can never feed itself through the panel's own resync.
   */
  lifecycle: {
    attach: ({ intents }: any) => {
      const carriers = ['inbox.approve', 'agent-panel.callTool'];
      const onAudit = (event: Event) => {
        const entry = (event as CustomEvent<any>).detail;

        if (carriers.includes(entry.tool) && entry.ok) intents.refresh();
      };

      document.addEventListener('janux:audit', onAudit);
      stopAudit = () => document.removeEventListener('janux:audit', onAudit);
    },
    detach: () => stopAudit?.(),
  },

  intents: {
    refresh: intent({
      description: 'Re-query the roster and the trail',
      guard: 'forbidden',
      run: ({ emit }: any) => emit('customers.changed', {}),
    }),

    create: intent({
      description: 'Add a customer to the roster.',
      // Defaults are what the agent panel offers as a runnable example payload,
      // so "call it" adds a plausible person instead of failing on "example".
      input: schema({ name: str().min(1).default('Marie Curie'), email: str().min(3).default('marie@example.com'), plan: enums(PLANS).default('starter') }),
      run: async ({ input, emit }: any) => {
        await create({ name: input.name, email: input.email, plan: input.plan });
        emit('customers.changed', {});
      },
    }),

    upgrade: intent({
      description: 'Move a customer to another plan.',
      input: schema({ id: str().default('cus_101'), plan: enums(PLANS) }),
      run: async ({ input, emit }: any) => {
        await update({ id: input.id, plan: input.plan });
        emit('customers.changed', {});
      },
    }),

    remove: intent({
      description: 'Delete a customer and everything they own. Irreversible.',
      guard: 'confirm',
      input: schema({ id: str().default('cus_103') }),
      run: async ({ input, emit }: any) => {
        await remove({ id: input.id, reason: 'removed from the desk' });
        emit('customers.changed', {});
      },
    }),
  },

  view: ({ sources, intents }: any) => (
    <section class="desk">
      <h2>Customers</h2>
      {sources.roster.pending ? (
        <p>Loading customers…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Plan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>{sources.roster.value.customers.map((entry: any) => CustomerRow({ entry, intents }))}</tbody>
        </table>
      )}
      <form class="new-customer" onSubmit={intents.create}>
        <input name="name" placeholder="Name" />
        <input name="email" placeholder="email@company.com" />
        <select name="plan">
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <button type="submit">Add customer</button>
      </form>

      <h2>Audit trail</h2>
      {sources.trail.pending || sources.trail.value.entries.length === 0 ? (
        <p class="audit-empty">No changes yet.</p>
      ) : (
        <ol class="audit">
          {sources.trail.value.entries.map((entry: any) => (
            <li key={String(entry.seq)} class="entry">
              <span class={`origin ${entry.actor}`}>{entry.actor}</span>
              <code>{entry.tool}</code>
              <span class="detail">{entry.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  ),
});
