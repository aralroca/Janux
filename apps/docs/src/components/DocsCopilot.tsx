import { component, intent, schema, str, bool, enums, list, int } from 'janux';
import type { Exchange } from '../copilot/controller';

const DOWNLOAD_NOTE =
  'Run an open-source model (Qwen3 0.6B, ~0.5 GB download, cached) entirely in your browser. ' +
  'Your questions never leave your machine.';

/**
 * The agent runtime (gui-agent, ai, and — behind `localLlm` — the model itself)
 * loads only when the visitor actually uses Ask AI, and only once.
 */
let controllerModule: Promise<typeof import('../copilot/controller')> | undefined;

function controller(): Promise<typeof import('../copilot/controller')> {
  controllerModule ??= import('../copilot/controller');

  return controllerModule;
}

async function converse(state: any, text: string): Promise<void> {
  const { ask } = await controller();
  const history: Exchange[] = state.messages
    .slice(0, -1)
    .map(({ role, text: line }: Exchange) => ({ role, text: line }));
  const reply = await ask(text, history).catch((error: unknown) => ({
    text: `Something went wrong: ${String(error)}`,
    html: '',
  }));

  state.messages.push({ role: 'assistant', text: reply.text, html: reply.html });
}

/** Chat UX: the field empties the moment the question is sent (uncontrolled input). */
function clearInput(): void {
  const field = document.querySelector<HTMLInputElement>('.copilot-panel input[name="text"]');

  if (field) field.value = '';
}

async function chooseMode(state: any): Promise<void> {
  const { supportsLocalLlm, setupServer } = await controller();

  state.mode = supportsLocalLlm() ? 'consent' : 'server';
  if (state.mode === 'server') setupServer();
}

async function enableLocalModel(state: any): Promise<void> {
  if (state.mode !== 'consent') return;
  state.mode = 'loading';
  const { setupLocal, setupServer } = await controller();

  try {
    await setupLocal((percent: number) => (state.progress = percent));
    state.mode = 'local';
  } catch (error) {
    setupServer();
    state.mode = 'server';
    state.messages.push({
      role: 'assistant',
      text: `Local model unavailable (${String(error)}); using the server model.`,
      html: '',
    });
  }
}

export const DocsCopilot = component({
  name: 'copilot',
  description: 'Documentation copilot: answers questions about Janux using the docs search tools.',

  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str(), html: str() }),
    busy: bool(),
    open: bool(),
    mode: enums(['idle', 'consent', 'loading', 'local', 'server']),
    progress: int(),
  }),

  intents: {
    toggle: intent({
      description: 'Open or close the copilot panel',
      run: async ({ state }: any) => {
        state.open = !state.open;
        if (state.open && state.mode === 'idle') await chooseMode(state);
      },
    }),
    enableLocal: intent({
      description: 'Download the in-browser model and answer locally',
      run: ({ state }: any) => enableLocalModel(state),
    }),
    useServer: intent({
      description: 'Skip the download and use the server model',
      run: async ({ state }: any) => {
        const { setupServer } = await controller();

        setupServer();
        state.mode = 'server';
      },
    }),
    send: intent({
      description: 'Ask the docs copilot a question',
      input: schema({ text: str().min(1) }),
      run: async ({ state, input }: any) => {
        state.messages.push({ role: 'user', text: input.text, html: '' });
        state.busy = true;
        clearInput();
        await converse(state, input.text).finally(() => {
          state.busy = false;
        });
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <aside class={state.open ? 'copilot open' : 'copilot'}>
      <button class="copilot-toggle" on={intents.toggle}>
        {state.open ? '×' : 'Ask AI'}
      </button>
      {state.open ? (
        <div class="copilot-panel">
          {state.mode === 'consent' ? (
            <div class="copilot-setup">
              <p>{DOWNLOAD_NOTE}</p>
              <button on={intents.enableLocal}>Run locally</button>
              <button class="secondary" on={intents.useServer}>
                Use server model
              </button>
            </div>
          ) : null}
          {state.mode === 'loading' ? (
            <div class="copilot-setup">
              <p>Downloading model… {state.progress}%</p>
              <progress max="100" value={String(state.progress)} />
            </div>
          ) : null}
          {state.mode === 'local' || state.mode === 'server' ? (
            <>
              <ol class="chat">
                {state.messages.map((message: any, index: number) => (
                  <li key={String(index)} class={message.role} dangerHTML={message.html || undefined}>
                    {message.html ? null : message.text}
                  </li>
                ))}
                {state.busy ? (
                  <li key="thinking" class="assistant thinking">
                    Thinking
                  </li>
                ) : null}
              </ol>
              <form intent={intents.send}>
                <input name="text" placeholder={state.busy ? 'Thinking…' : `Ask about Janux (${state.mode})`} />
                <button type="submit">Send</button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  ),
});
