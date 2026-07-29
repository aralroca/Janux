import { component, int, intent, list, money, schema, str } from 'janux';
import { transfer } from '../server/payments.api';

let stopAudit: (() => void) | undefined;

/** The intents the visible trail mirrors — never `payments.record` itself. */
const AUDITED_TOOLS = ['payments.draft', 'payments.send'];

/** Vendors the desk suggests, in order: every new draft names a different payee and amount. */
const PAYEES = [
  { to: 'Nimbus Cloud', amountCents: 990 },
  { to: 'Orbit Freight', amountCents: 24500 },
  { to: 'Vela Design', amountCents: 7800 },
  { to: 'Harbor Legal', amountCents: 156000 },
];

const ERROR_PREFIX = /^Error:\s*/;

const euros = (cents: number) => `${(cents / 100).toFixed(2)}€`;
const suggestion = (state: any) => PAYEES[state.nextPayee % PAYEES.length]!;
const draftIds = (state: any) => state.queue.filter((row: any) => row.status === 'draft').map((row: any) => row.id);
const reason = (error?: string) => (error ?? 'failed').replace(ERROR_PREFIX, '');

/** What the trail shows for a framework AuditEntry: payee + amount, or why the call failed. */
function detailFor(entry: any, state: any): string | undefined {
  if (!entry.ok) return reason(entry.error);
  if (entry.tool === 'payments.draft') return `${entry.input.to} ${euros(entry.input.amountCents)}`;
  const payment = state.queue.find((row: any) => row.id === entry.input?.id);

  return payment ? `${payment.to} ${euros(payment.amountCents)}` : undefined;
}

export const PaymentsDesk = component({
  name: 'payments',
  description: 'Outgoing payments desk. Drafting is free for everyone; sending money needs a human.',

  state: schema({
    queue: list({ id: str(), to: str(), amountCents: money(), status: str(), ref: str() }).default([
      { id: 'pay_acme', to: 'Acme Corp', amountCents: 12000, status: 'draft', ref: '' },
      { id: 'pay_lumen', to: 'Lumen Labs', amountCents: 4550, status: 'draft', ref: '' },
    ]),
    nextPayee: int().default(0),
    audit: list({ id: str(), tool: str(), detail: str(), origin: str(), outcome: str() }),
  }),

  intents: {
    draft: intent({
      description: 'Queue a new outgoing payment draft. Does not move money.',
      input: schema({ to: str().min(1).default('Nimbus Cloud'), amountCents: money().default(990) }),
      run: ({ state, input }: any) => {
        const id = `pay_${state.queue.length + 1}`;

        state.queue.push({ id, to: input.to, amountCents: input.amountCents, status: 'draft', ref: '' });
        // Whoever drafted, the desk moves on to the next vendor it suggests.
        state.nextPayee += 1;
      },
    }),

    send: intent({
      description: 'Send a drafted payment by id. Moves real money — agent calls park as a proposal.',
      guard: 'confirm',
      // `options()` publishes the ids that are actually pending right now, so a
      // caller reading the manifest never aims at a payment that already went out.
      input: schema({ id: str().default('pay_acme').options(({ state }: any) => draftIds(state)) }),
      ready: ({ state }: any) => draftIds(state).length > 0,
      run: async ({ state, input }: any) => {
        const payment = state.queue.find((row: any) => row.id === input.id);

        if (!payment) throw new Error(`Unknown payment "${input.id}"`);
        if (payment.status === 'sent') throw new Error(`Payment "${input.id}" was already sent`);
        const executed: any = await transfer({ to: payment.to, amountCents: payment.amountCents });

        payment.status = 'sent';
        payment.ref = executed.transferId;
      },
    }),

    record: intent({
      description: 'Append a framework janux:audit entry to the visible trail. Not an agent tool.',
      guard: 'forbidden',
      input: schema({ tool: str(), detail: str(), origin: str(), outcome: str() }),
      run: ({ state, input }: any) => {
        state.audit.unshift({ id: `audit_${state.audit.length + 1}`, ...input });
      },
    }),
  },

  /**
   * The trail is fed by the framework's own audit stream: every executed
   * intent arrives as a `janux:audit` DOM event (origin and outcome included),
   * so `run()` bodies no longer re-record themselves by hand — and a refused
   * call is as visible as a successful one.
   */
  lifecycle: {
    attach: ({ state, intents }: any) => {
      const onAudit = (event: Event) => {
        const entry = (event as CustomEvent<any>).detail;

        if (entry.proposed || !AUDITED_TOOLS.includes(entry.tool)) return;
        const detail = detailFor(entry, state);

        if (detail) intents.record({ tool: entry.tool, detail, origin: entry.origin, outcome: entry.ok ? 'ok' : 'failed' });
      };

      document.addEventListener('janux:audit', onAudit);
      stopAudit = () => document.removeEventListener('janux:audit', onAudit);
    },
    detach: () => stopAudit?.(),
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
      <button class="new-draft" onClick={intents.draft.with(suggestion(state))}>
        + Draft {euros(suggestion(state).amountCents)} to {suggestion(state).to}
      </button>

      <h2>Audit trail</h2>
      {state.audit.length === 0 ? <p class="audit-empty">No sensitive actions yet.</p> : null}
      <ol class="audit">
        {state.audit.map((entry: any) => (
          <li key={entry.id} class={`entry ${entry.origin} ${entry.outcome}`}>
            <span class={`origin ${entry.origin}`}>{entry.origin}</span>
            <code>{entry.tool}</code>
            <span class="detail">{entry.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  ),
});
