import { component, intent, list, schema, str, type Proposal } from 'janux';

let stopListening: (() => void) | undefined;

function bridge(): any {
  return (window as any).janux;
}

function summarize(proposal: Proposal): string {
  const input = proposal.input === undefined ? '' : ` ${JSON.stringify(proposal.input)}`;

  return `${proposal.tool}${input}`;
}

/**
 * Parks `janux:proposal` events as inbox rows. Its own intents are `forbidden`:
 * an agent can never approve (or even see) its own pending proposal.
 */
export const ApprovalsInbox = component({
  name: 'inbox',
  description: 'Pending agent proposals. Approving or rejecting is a human-only act.',

  state: schema({ pending: list({ id: str(), tool: str(), summary: str() }) }),

  intents: {
    park: intent({
      description: 'Record an incoming proposal in the inbox',
      guard: 'forbidden',
      input: schema({ id: str(), tool: str(), summary: str() }),
      run: ({ state, input }: any) => state.pending.push({ id: input.id, tool: input.tool, summary: input.summary }),
    }),

    approve: intent({
      description: 'Execute a parked proposal exactly once',
      guard: 'forbidden',
      input: schema({ id: str() }),
      run: async ({ state, input }: any) => {
        await bridge().approve(input.id);
        state.pending = state.pending.filter((row: any) => row.id !== input.id);
      },
    }),

    reject: intent({
      description: 'Discard a parked proposal without running it',
      guard: 'forbidden',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        bridge().reject(input.id);
        state.pending = state.pending.filter((row: any) => row.id !== input.id);
      },
    }),
  },

  lifecycle: {
    attach: ({ intents }: any) => {
      const park = (event: Event) => {
        const proposal = (event as CustomEvent<Proposal>).detail;

        intents.park({ id: proposal.id, tool: proposal.tool, summary: summarize(proposal) });
      };

      document.addEventListener('janux:proposal', park);
      stopListening = () => document.removeEventListener('janux:proposal', park);
    },
    detach: () => stopListening?.(),
  },

  view: ({ state, intents }: any) => (
    <section class="inbox">
      <h2>Approvals inbox</h2>
      {state.pending.length === 0 ? <p class="inbox-empty">No pending proposals.</p> : null}
      {state.pending.map((row: any) => (
        <div key={row.id} class="proposal-card" role="alert">
          <p class="proposal-title">⏸ Approval required</p>
          <code class="summary">{row.summary}</code>
          <p class="proposal-why">guard: confirm — nothing happens until you decide.</p>
          <div class="proposal-actions">
            <button class="approve" onClick={intents.approve.with({ id: row.id })}>
              Approve
            </button>
            <button class="reject" onClick={intents.reject.with({ id: row.id })}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </section>
  ),
});
