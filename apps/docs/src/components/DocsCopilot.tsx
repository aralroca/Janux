import { component, intent, schema, str, bool, enums, list } from 'janux';
import { clearInput, controller, converse, scrollToLatest } from '../copilot/panel';

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
  }),

  intents: {
    toggle: intent({
      description: 'Open or close the copilot panel',
      run: async ({ state }: any) => {
        state.open = !state.open;
        if (!state.open || state.ready) return;
        const { setup } = await controller();

        await setup();
        state.ready = true;
      },
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
