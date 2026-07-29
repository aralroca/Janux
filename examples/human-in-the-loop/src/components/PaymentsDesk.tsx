import { component, intent, list, money, schema, str } from 'janux';
import { transfer } from '../server/payments.api';

let draftSeq = 0;
let auditSeq = 0;

const euros = (cents: number) => `${(cents / 100).toFixed(2)}€`;

/** App-level audit trail: every executed action remembers who did it. */
function record(state: any, tool: string, detail: string, origin: string): void {
  auditSeq += 1;
  state.audit.unshift({ id: `audit_${auditSeq}`, tool, detail, origin });
}

export const PaymentsDesk = component({
  name: 'payments',
  description: 'Outgoing payments desk. Drafting is free for everyone; sending money needs a human.',

  state: schema({
    queue: list({ id: str(), to: str(), amountCents: money(), status: str(), ref: str() }).default([
      { id: 'pay_acme', to: 'Acme Corp', amountCents: 12000, status: 'draft', ref: '' },
      { id: 'pay_lumen', to: 'Lumen Labs', amountCents: 4550, status: 'draft', ref: '' },
    ]),
    audit: list({ id: str(), tool: str(), detail: str(), origin: str() }),
  }),

  intents: {
    draft: intent({
      description: 'Queue a new outgoing payment draft. Does not move money.',
      input: schema({ to: str().min(1), amountCents: money() }),
      run: ({ state, input, origin }: any) => {
        draftSeq += 1;
        state.queue.push({ id: `pay_new_${draftSeq}`, to: input.to, amountCents: input.amountCents, status: 'draft', ref: '' });
        record(state, 'payments.draft', `${input.to} ${euros(input.amountCents)}`, origin ?? 'human');
      },
    }),

    send: intent({
      description: 'Send a drafted payment by id. Moves real money — agent calls park as a proposal.',
      guard: 'confirm',
      input: schema({ id: str().default('pay_acme') }),
      ready: ({ state }: any) => state.queue.some((payment: any) => payment.status === 'draft'),
      run: async ({ state, input, origin }: any) => {
        const payment = state.queue.find((row: any) => row.id === input.id);

        if (!payment) throw new Error(`Unknown payment "${input.id}"`);
        if (payment.status === 'sent') throw new Error(`Payment "${input.id}" was already sent`);
        const executed: any = await transfer({ to: payment.to, amountCents: payment.amountCents });

        payment.status = 'sent';
        payment.ref = executed.transferId;
        record(state, 'payments.send', `${payment.to} ${euros(payment.amountCents)}`, origin ?? 'human');
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="desk">
      <h2>Outgoing payments</h2>
      <ul class="queue">
        {state.queue.map((payment: any) => (
          <li key={payment.id} data-payment={payment.id} class={`payment ${payment.status}`}>
            <span class="to">{payment.to}</span>
            <span class="amount">{euros(payment.amountCents)}</span>
            <span class="status">{payment.status}</span>
            {payment.ref ? <code class="ref">{payment.ref}</code> : null}
            {payment.status === 'draft' ? (
              <button class="send" onClick={intents.send.with({ id: payment.id })}>
                Send
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <button class="new-draft" onClick={intents.draft.with({ to: 'Nimbus Cloud', amountCents: 990 })}>
        + Draft 9.90€ to Nimbus Cloud
      </button>

      <h2>Audit trail</h2>
      {state.audit.length === 0 ? <p class="audit-empty">No sensitive actions yet.</p> : null}
      <ol class="audit">
        {state.audit.map((entry: any) => (
          <li key={entry.id} class={`entry ${entry.origin}`}>
            <span class={`origin ${entry.origin}`}>{entry.origin}</span>
            <code>{entry.tool}</code>
            <span class="detail">{entry.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  ),
});
