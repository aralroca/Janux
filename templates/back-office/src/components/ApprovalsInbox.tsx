import { component, intent, list, schema, str, type Proposal } from 'janux';

let stopListening: (() => void) | undefined;

const ERROR_PREFIX = /^Error:\s*/;

function bridge(): any {
  return (window as any).janux;
}

function summarize(proposal: Proposal): string {
  const input = proposal.input === undefined ? '' : ` ${JSON.stringify(proposal.input)}`;

  return `${proposal.tool}${input}`;
}

/**
 * An approval either runs the parked call or explains itself. The proposal is
 * consumed either way — the world may have moved on since it was parked (the
 * payment went out by hand), and what the human is owed then is the reason,
 * not a button that silently does nothing.
 */
function settle(approve: Promise<unknown>): Promise<string> {
  return approve.then(
    () => '',
    (error: unknown) => String(error).replace(ERROR_PREFIX, ''),
  );
}

/**
 * Parks `janux:proposal` events as inbox rows. Its own intents are `forbidden`:
 * an agent can never approve (or even see) its own pending proposal.
 */
export const ApprovalsInbox = component({
  name: 'inbox',
  description: 'Pending agent proposals. Approving or rejecting is a human-only act.',

  state: schema({ pending: list({ id: str(), tool: str(), summary: str() }), failure: str().default('') }),

  intents: {
    park: intent({
      description: 'Record an incoming proposal in the inbox',
      guard: 'forbidden',
      input: schema({ id: str(), tool: str(), summary: str() }),
      run: ({ state, input }: any) => {
        state.pending.push({ id: input.id, tool: input.tool, summary: input.summary });
        state.failure = '';
      },
    }),

    approve: intent({
      description: 'Execute a parked proposal exactly once',
      guard: 'forbidden',
      input: schema({ id: str() }),
      run: async ({ state, input }: any) => {
        const failure = await settle(bridge().approve(input.id));

        state.pending = state.pending.filter((row: any) => row.id !== input.id);
        state.failure = failure;
      },
    }),

    reject: intent({
      description: 'Discard a parked proposal without running it',
      guard: 'forbidden',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        bridge().reject(input.id);
        state.pending = state.pending.filter((row: any) => row.id !== input.id);
        state.failure = '';
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
      {state.failure ? (
        <p class="approval-failed" role="alert">
          ⚠ Not approved: {state.failure}
        </p>
      ) : null}
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
