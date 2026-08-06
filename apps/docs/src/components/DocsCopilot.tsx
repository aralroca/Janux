import { component, effect, intent, schema, str, bool, enums, list } from 'janux';
import { offerPendingApproval, releaseApprovalSurface, useApprovalSurface } from '../approvals';
import { ProposalCard } from './ProposalCard';
import {
  approvalSurface,
  clearInput,
  controller,
  converse,
  rememberQuestion,
  resumeAfterReload,
  scrollToLatest,
  settleProposal,
  wasInterrupted,
} from '../copilot/panel';

/**
 * Outside the schema on purpose: an AbortController is not state, it is a handle.
 * Created by `send` before it awaits anything, because the first question waits
 * on a dynamic import while the Stop button is already on screen — a Stop in that
 * window used to be a silent no-op, and the answer arrived anyway.
 */
let run: AbortController | undefined;

export const DocsCopilot = component({
  name: 'copilot',
  description: 'Documentation copilot: answers questions about Janux using the docs search tools.',

  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str(), html: str() }),
    busy: bool(),
    open: bool(),
    ready: bool(),
    status: str(),
    /** The proposal a guarded tool call is parked on, if any. Empty id = none pending. */
    proposalId: str(),
    proposalSummary: str(),
  }),

  lifecycle: {
    // Keyed on `state`, which is this instance: a stale detach must not
    // unregister the surface a live one just installed.
    attach: ({ state, intents }: any) => useApprovalSurface(approvalSurface(state, intents), state),
    detach: ({ state }: any) => releaseApprovalSurface(state),
  },

  effects: {
    resumeAnswer: effect({
      description: 'Picks up an answer a reload interrupted, from where it got to',
      // `wasInterrupted()` is a bare key read: the page must not pay for the
      // agent runtime just to discover it has nothing to resume.
      run: ({ state }: any) => (wasInterrupted() ? resumeAfterReload(state) : undefined),
    }),
  },

  intents: {
    toggle: intent({
      description: 'Open or close the copilot panel',
      run: async ({ state }: any) => {
        state.open = !state.open;
        if (!state.open) return;
        // An agent may have raised a proposal while this was shut; opening is
        // the first moment the reader can actually answer it.
        offerPendingApproval();
        if (state.ready) return;
        const { setup } = await controller();

        await setup();
        state.ready = true;
      },
    }),
    /*
     * Human-only, like `send` and `stop`: an agent that can approve its own
     * proposal is not a guard, it is a formality. `copilot.*` is excluded from
     * the copilot's tools too — belt and braces on the one intent where it
     * actually matters.
     */
    showProposal: intent({
      description: 'Put the proposal an agent raised in front of the reader (empty id clears it)',
      guard: 'forbidden',
      input: schema({ id: str(), summary: str() }),
      run: ({ state, input }: any) => {
        state.proposalId = input.id;
        state.proposalSummary = input.summary;
      },
    }),
    approve: intent({
      description: 'Approve the proposal the agent raised',
      guard: 'forbidden',
      run: ({ state }: any) => settleProposal(state, true),
    }),
    reject: intent({
      description: 'Reject the proposal the agent raised',
      guard: 'forbidden',
      run: ({ state }: any) => settleProposal(state, false),
    }),
    stop: intent({
      description: 'Stop the answer being written',
      guard: 'forbidden',
      run: ({ state }: any) => {
        run?.abort();
        state.busy = false;
      },
    }),
    send: intent({
      description: 'Ask the docs copilot a question',
      // Human-only: an agent that can drive this intent can talk to itself.
      guard: 'forbidden',
      input: schema({ text: str().min(1) }),
      run: async ({ state, input }: any) => {
        /*
         * One run at a time. Enter submits the form even while the Stop button is
         * showing, and two runs share one `serverLlm` — so its chunk subscribers
         * would splice the second answer's tokens into the first one's bubble.
         */
        if (state.busy) return;
        state.messages.push({ role: 'user', text: input.text, html: '' });
        state.messages.push({ role: 'assistant', text: '', html: '' });
        state.busy = true;
        state.status = 'Reading the docs…';
        run = new AbortController();
        // Remembered before the turn starts: a reload one keystroke later still
        // knows which question the answer coming back belongs to.
        rememberQuestion(input.text);
        clearInput();
        scrollToLatest();
        await converse(state, input.text, run.signal).finally(() => {
          state.busy = false;
          state.status = '';
        });
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <aside class={state.open ? 'copilot open' : 'copilot'}>
      {state.open ? null : (
        <button class="copilot-toggle" onClick={intents.toggle}>
          <span class="copilot-spark" aria-hidden="true">
            ✦
          </span>
          Ask AI
        </button>
      )}
      {state.open ? (
        <div class="copilot-panel" role="dialog" aria-label="Ask AI about Janux">
          <header class="copilot-head">
            <span class="copilot-title">
              <span class="copilot-spark" aria-hidden="true">
                ✦
              </span>
              Ask AI
            </span>
            <button class="copilot-close" type="button" aria-label="Close" onClick={intents.toggle}>
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>
          <ol class="chat">
            {state.messages.map((message: any, index: number) => (
              <li key={String(index)} class={message.role} dangerHTML={message.html || undefined}>
                {message.html ? null : message.text}
              </li>
            ))}
            {state.status ? (
              <li key="status" class="assistant thinking">
                {state.status}
              </li>
            ) : null}
          </ol>
          {state.proposalId
            ? ProposalCard({ summary: state.proposalSummary, onApprove: intents.approve, onReject: intents.reject })
            : null}
          <form onSubmit={intents.send}>
            <input name="text" placeholder={state.ready ? 'Ask about Janux' : 'Starting…'} />
            {state.busy ? (
              <button type="button" class="secondary" onClick={intents.stop}>
                Stop
              </button>
            ) : (
              <button type="submit">Send</button>
            )}
          </form>
        </div>
      ) : null}
    </aside>
  ),
});
