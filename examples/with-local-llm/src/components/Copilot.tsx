import { bool, component, enums, int, intent, list, schema, str } from 'janux';

const GREETING =
  'Hi! Try “add a task called buy oat milk”, “mark the offsite done” or “clear the completed tasks”.';
const CONSENT = 'The local model is not downloaded yet — press “Load model” first (~0.5 GB, cached after that).';

/** The agent runtime loads on first use, and only once (dynamic imports are cached). */
const runtime = () => import('../copilot');

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The model card under the toggle: what brain runs where, and its state. */
function ModelStatus({ state, intents }: any) {
  if (state.brain === 'cloud') {
    const note = state.supported
      ? 'Cloud brain: the server answers via /_janux/llm.'
      : 'No WebGPU in this browser — falling back to the cloud brain (/_janux/llm).';

    return (
      <p id="model-status" data-model-state="cloud">
        {note}
      </p>
    );
  }
  if (state.model === 'ready') {
    return (
      <p id="model-status" data-model-state="ready">
        Model ready — everything runs in your browser.
      </p>
    );
  }
  if (state.model === 'loading') {
    return (
      <p id="model-status" data-model-state="loading">
        Downloading model… {state.progress}%
      </p>
    );
  }

  return (
    <p id="model-status" data-model-state="idle">
      Local model not downloaded.{' '}
      <button id="load-model" onClick={intents.load}>
        Load model (~0.5 GB)
      </button>
    </p>
  );
}

export const Copilot = component({
  name: 'copilot',
  description: 'The chat panel: a copilot whose brain is the local WebGPU model, or the server as fallback.',
  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str() }).default([
      { role: 'assistant', text: GREETING },
    ]),
    busy: bool().default(false),
    supported: bool().default(false),
    brain: enums(['local', 'cloud']).default('cloud'),
    model: enums(['idle', 'loading', 'ready']).default('idle'),
    progress: int().default(0),
  }),
  lifecycle: {
    // Client-only: SSR ships the neutral shell, the browser says what it can run.
    attach: ({ intents }: any) => intents.detect(),
  },
  intents: {
    detect: intent({
      guard: 'forbidden',
      description: 'Feature-detect WebGPU and pick the default brain.',
      run: async ({ state }: any) => {
        const { detect } = await runtime();

        state.supported = detect();
        state.brain = state.supported ? 'local' : 'cloud';
      },
    }),
    swap: intent({
      guard: 'forbidden',
      description: 'Switch the brain between the local model and the cloud.',
      input: schema({ brain: enums(['local', 'cloud']) }),
      ready: ({ state }: any) => !state.busy,
      run: ({ state, input }: any) => {
        if (input.brain === 'local' && !state.supported) return;
        state.brain = input.brain;
      },
    }),
    load: intent({
      guard: 'forbidden',
      description: 'Download the local model into the browser cache, with progress.',
      ready: ({ state }: any) => state.supported && state.model === 'idle',
      run: async ({ state }: any) => {
        const { loadModel } = await runtime();

        state.model = 'loading';
        await loadModel((fraction: number) => (state.progress = Math.round(fraction * 100)));
        state.model = 'ready';
      },
    }),
    // `forbidden`: the copilot answers through the loop, it does not talk to itself.
    send: intent({
      guard: 'forbidden',
      description: 'Ask the copilot to operate the task list.',
      input: schema({ text: str().min(1) }),
      ready: ({ state }: any) => !state.busy,
      run: async ({ state, input }: any) => {
        state.messages.push({ role: 'user', text: input.text });
        // Consent gate: never start a ~0.5 GB download from a chat message.
        if (state.brain === 'local' && state.model !== 'ready') {
          state.messages.push({ role: 'assistant', text: CONSENT });

          return;
        }
        state.busy = true;
        const { ask } = await runtime();
        const text = await ask(state.brain, input.text)
          .then((answer) => answer.text)
          .catch(messageOf)
          .finally(() => (state.busy = false));

        state.messages.push({ role: 'assistant', text });
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <aside id="assistant-panel" data-brain={state.brain}>
      <header>
        <span>🤖 Copilot</span>
        <div id="brain-toggle" role="group" aria-label="Brain">
          <button
            id="brain-local"
            class={state.brain === 'local' ? 'on' : ''}
            disabled={!state.supported}
            title={state.supported ? 'Run the model in this browser' : 'Needs WebGPU'}
            onClick={intents.swap.with({ brain: 'local' })}
          >
            Local
          </button>
          <button
            id="brain-cloud"
            class={state.brain === 'cloud' ? 'on' : ''}
            onClick={intents.swap.with({ brain: 'cloud' })}
          >
            Cloud
          </button>
        </div>
      </header>
      <ModelStatus state={state} intents={intents} />
      <div id="log">
        {state.messages.map((message: any, index: number) => (
          <div key={String(index)} class={`msg ${message.role}`}>
            {message.text}
          </div>
        ))}
      </div>
      <form class="ask" onSubmit={intents.send} reset>
        <input name="text" placeholder={state.busy ? 'Thinking…' : 'e.g. "what is still open?"'} autoComplete="off" />
        <button class="primary" type="submit">
          Send
        </button>
      </form>
    </aside>
  ),
});
