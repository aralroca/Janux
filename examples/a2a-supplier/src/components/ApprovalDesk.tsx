import { component, intent, schema, str } from 'janux';

/**
 * The human end of `guard: 'confirm'`, for a call that came from another app.
 *
 * The desk is handed a proposal token and nothing else, on purpose: the token
 * is a capability, not a description, and the caller who sent the human here is
 * the last party whose account of what it asked for should be trusted. What the
 * operator gets instead is the supplier's own answer — approving runs the
 * parked call and prints the shipment this app really recorded.
 */

const ERROR_PREFIX = /^Error:\s*/;

function bridge(): any {
  return (window as any).janux;
}

const reason = (error: unknown) => String(error).replace(ERROR_PREFIX, '');

export const ApprovalDesk = component({
  name: 'approval-desk',
  description: 'Settles one parked proposal. Approving and rejecting are human acts, never an agent’s.',

  state: schema({ token: str().default(''), outcome: str().default(''), failure: str().default('') }),

  intents: {
    approve: intent({
      description: 'Run the parked call this token settles',
      guard: 'forbidden',
      run: async ({ state }: any) => {
        try {
          state.outcome = JSON.stringify(await bridge().approve(state.token));
          state.failure = '';
        } catch (error) {
          state.failure = reason(error);
        }
      },
    }),

    reject: intent({
      description: 'Discard the parked call without running it',
      guard: 'forbidden',
      run: ({ state }: any) => {
        bridge().reject(state.token);
        state.outcome = '';
        state.failure = 'rejected — nothing shipped';
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <section class="desk">
      <h2>Approve a parked call</h2>
      <p class="hint">
        An outside agent asked this app to run <code>supplier.ship</code>, which is <code>guard: 'confirm'</code>. Nothing
        has run yet.
      </p>
      <p class="token">{state.token}</p>
      <div class="row">
        <button class="approve" onClick={intents.approve} disabled={state.outcome !== '' || state.failure !== ''}>
          Approve — ship it
        </button>
        <button class="ghost" onClick={intents.reject} disabled={state.outcome !== '' || state.failure !== ''}>
          Reject
        </button>
      </div>
      {state.outcome !== '' && (
        <p class="ok">
          Shipped: <code>{state.outcome}</code>
        </p>
      )}
      {state.failure !== '' && <p class="bad">{state.failure}</p>}
    </section>
  ),
});
