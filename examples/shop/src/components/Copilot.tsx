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

async function runUiCalls(calls: any[], state: any): Promise<void> {
  for (const call of calls) {
    const bridge = (window as any).janux;
    const result = await bridge.call(call.name, call.input).catch((error: unknown) => ({ error: String(error) }));

    if (result?.status === 'proposal') state.proposal = { id: result.id, tool: call.name };
    wire.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result ?? null) });
  }
}

async function converse(state: any, path: string): Promise<void> {
  let reply = await postAgent(wire, path);

  while (reply.type === 'ui_calls') {
    wire = reply.messages;
    await runUiCalls(reply.calls, state);
    reply = await postAgent(wire, path);
  }
  wire = reply.messages ?? wire;
  state.messages.push({ role: 'assistant', text: reply.type === 'setup' ? reply.message : reply.text });
}

export const Copilot = component({
  name: 'copilot',
  description: 'Built-in chat copilot that operates this page through the agent bridge.',

  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str() }),
    busy: bool(),
    proposal: obj({ id: str(), tool: str() }).nullable(),
  }),

  intents: {
    send: intent({
      description: 'Send a message to the copilot',
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

    approve: intent({
      description: 'Approve the pending proposal',
      guard: 'forbidden',
      run: async ({ state }: any) => {
        if (!state.proposal) return;
        await (window as any).janux.approve(state.proposal.id);
        state.messages.push({ role: 'assistant', text: `Approved: ${state.proposal.tool} ✔` });
        state.proposal = null;
      },
    }),

    reject: intent({
      description: 'Reject the pending proposal',
      guard: 'forbidden',
      run: ({ state }: any) => {
        (window as any).janux.reject(state.proposal?.id);
        state.proposal = null;
      },
    }),
  },

  view: ({ state, intents }: any) => (
    <aside class="copilot">
      <h3>Copilot</h3>
      <ol class="chat">
        {state.messages.map((message: any, index: number) => (
          <li key={String(index)} class={message.role}>
            {message.text}
          </li>
        ))}
      </ol>
      {state.proposal ? (
        <div class="proposal">
          <p>The copilot wants to run “{state.proposal.tool}”.</p>
          <button on={intents.approve}>Approve</button>
          <button on={intents.reject}>Reject</button>
        </div>
      ) : null}
      <form intent={intents.send}>
        <input name="text" placeholder={state.busy ? 'Thinking…' : 'Ask the copilot'} />
        <button type="submit">Send</button>
      </form>
    </aside>
  ),
});
