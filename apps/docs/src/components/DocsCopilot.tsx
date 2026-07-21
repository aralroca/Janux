import { component, intent, schema, str, bool, enums, list, obj } from 'janux';

let wire: any[] = [];

async function postAgent(messages: unknown[], path: string): Promise<any> {
  const response = await fetch('/_janux/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, path }),
  });

  return response.json();
}

async function converse(state: any, path: string): Promise<void> {
  let reply = await postAgent(wire, path);

  while (reply.type === 'ui_calls') {
    wire = reply.messages;
    for (const call of reply.calls) {
      const result = await (window as any).janux
        .call(call.name, call.input)
        .catch((error: unknown) => ({ error: String(error) }));

      wire.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result ?? null) });
    }
    reply = await postAgent(wire, path);
  }
  wire = reply.messages ?? wire;
  state.messages.push({ role: 'assistant', text: reply.type === 'setup' ? reply.message : reply.text });
}

export const DocsCopilot = component({
  name: 'copilot',
  description: 'Documentation copilot: answers questions about Janux using the docs search tools.',

  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str() }),
    busy: bool(),
    open: bool(),
  }),

  intents: {
    toggle: intent({
      description: 'Open or close the copilot panel',
      run: ({ state }: any) => (state.open = !state.open),
    }),
    send: intent({
      description: 'Ask the docs copilot a question',
      input: schema({ text: str().min(1) }),
      run: async ({ state, input }: any) => {
        state.messages.push({ role: 'user', text: input.text });
        state.busy = true;
        wire.push({ role: 'user', content: input.text });
        await converse(state, window.location.pathname).finally(() => {
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
          <ol class="chat">
            {state.messages.map((message: any, index: number) => (
              <li key={String(index)} class={message.role}>
                {message.text}
              </li>
            ))}
          </ol>
          <form intent={intents.send}>
            <input name="text" placeholder={state.busy ? 'Thinking…' : 'Ask about Janux'} />
            <button type="submit">Send</button>
          </form>
        </div>
      ) : null}
    </aside>
  ),
});
