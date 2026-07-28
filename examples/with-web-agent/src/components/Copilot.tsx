import { bool, component, enums, intent, list, schema, str } from 'janux';
import { EXAMPLE_GOALS } from '../demo-plan';

const GREETING = `Hi! Try: ${EXAMPLE_GOALS.map((goal) => `“${goal}”`).join(', ')} — watch the glow follow each React Flow node.`;

/** The agent runtime loads on first use, and only once (dynamic imports are cached). */
async function answerFor(question: string): Promise<string> {
  const { ask } = await import('../copilot');
  const answer = await ask(question).catch((error: unknown) => ({ text: `Something went wrong: ${error}` }));

  return answer.text;
}

export const Copilot = component({
  name: 'copilot',
  description: 'The chat panel driving this console in natural language.',
  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str() }).default([
      { role: 'assistant', text: GREETING },
    ]),
    busy: bool().default(false),
  }),
  intents: {
    // `forbidden`: the agent answers through the loop, it does not talk to itself.
    send: intent({
      guard: 'forbidden',
      description: 'Ask the copilot to do something',
      input: schema({ text: str().min(1) }),
      ready: ({ state }: any) => !state.busy,
      run: async ({ state, input }: any) => {
        state.messages.push({ role: 'user', text: input.text });
        state.busy = true;
        const text = await answerFor(input.text).finally(() => {
          state.busy = false;
        });

        state.messages.push({ role: 'assistant', text });
      },
    }),
  },
  view: ({ state, intents }: any) => (
    <aside id="assistant-panel">
      <header>🤖 Assistant</header>
      <div id="log">
        {state.messages.map((message: any, index: number) => (
          <div key={String(index)} class={`msg ${message.role}`}>
            {message.text}
          </div>
        ))}
      </div>
      {state.messages.length === 1 ? (
        <div class="chips">
          {EXAMPLE_GOALS.map((text) => (
            <button key={text} class="chip" onClick={intents.send} data-input={JSON.stringify({ text })}>
              {text}
            </button>
          ))}
        </div>
      ) : null}
      <form class="ask" onSubmit={intents.send} reset>
        <input name="text" placeholder={state.busy ? 'Working…' : 'e.g. "invite jane@acme.com as admin"'} autocomplete="off" />
        <button class="primary" type="submit">
          Run
        </button>
      </form>
    </aside>
  ),
});
