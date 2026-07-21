import { component, intent, schema, str, bool, enums, list } from 'janux';

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

      if (result?.status === 'proposal') state.proposal = { id: result.id, tool: call.name };
      wire.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result ?? null) });
    }
    reply = await postAgent(wire, path);
  }
  wire = reply.messages ?? wire;
  state.messages.push({ role: 'assistant', text: reply.type === 'setup' ? reply.message : reply.text });
}

export const Copilot = component({
  name: 'copilot',
  description: 'Built-in copilot operating this app through the agent bridge.',

  state: schema({
    open: bool(),
    busy: bool(),
    messages: list({ role: enums(['user', 'assistant']), text: str() }),
    proposal: schema({ id: str(), tool: str() }).nullable(),
  }),

  intents: {
    toggle: intent({ description: 'Open/close the copilot', run: ({ state }: any) => (state.open = !state.open) }),
    send: intent({
      description: 'Send a message to the copilot',
      input: schema({ text: str().min(1) }),
      run: async ({ state, input }: any) => {
        state.messages.push({ role: 'user', text: input.text });
        state.busy = true;
        wire.push({ role: 'user', content: input.text });
        await converse(state, window.location.pathname).finally(() => (state.busy = false));
      },
    }),
    approve: intent({
      guard: 'forbidden',
      run: async ({ state }: any) => {
        await (window as any).janux.approve(state.proposal.id);
        state.messages.push({ role: 'assistant', text: `Approved ${state.proposal.tool} ✔` });
        state.proposal = null;
      },
    }),
    reject: intent({
      guard: 'forbidden',
      run: ({ state }: any) => {
        (window as any).janux.reject(state.proposal?.id);
        state.proposal = null;
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <aside class="copilot">
      <button class="copilot-toggle" on={intents.toggle}>
        {state.open ? '×' : '✦ Copilot'}
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
          {state.proposal ? (
            <div class="proposal">
              <p>Run “{state.proposal.tool}”?</p>
              <button on={intents.approve}>Approve</button>
              <button on={intents.reject}>Reject</button>
            </div>
          ) : null}
          <form intent={intents.send}>
            <input name="text" placeholder={state.busy ? 'Thinking…' : 'Try: add a task to buy milk'} />
            <button type="submit">Send</button>
          </form>
        </div>
      ) : null}
    </aside>
  ),
});
