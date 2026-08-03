import { component, intent, schema, str, bool, enums, list, obj } from 'janux';

let wire: any[] = [];
let toolListener: ((event: any) => void) | undefined;

const SUGGESTIONS = [
  'Acknowledge the payment webhooks incident',
  'Resolve everything that is acknowledged',
  'Put the site into maintenance mode',
];

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
    const result = await (window as any).janux
      .call(call.name, call.input)
      .catch((error: unknown) => ({ error: String(error) }));

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

/** Scripted demo: real tool calls through the real bridge — no model involved, and labeled as such. */
async function runDemo(state: any): Promise<void> {
  const bridge = (window as any).janux;

  state.messages.push({ role: 'assistant', text: '▶ Demo (no AI): watch me operate the board with real tool calls.' });
  await bridge.call('board.acknowledge', { id: 'INC-101' });
  await bridge.call('board.resolve', { id: 'INC-101' });
  const proposal: any = await bridge.call('board.maintenance', { enabled: true });

  if (proposal?.status === 'proposal') {
    state.proposal = { id: proposal.id, tool: 'board.maintenance' };
    state.messages.push({ role: 'assistant', text: 'Maintenance mode needs your approval — that is the confirm guard.' });
  }
}

export const Copilot = component({
  name: 'copilot',
  description: 'Chat copilot that operates the ops board through the agent bridge.',

  state: schema({
    messages: list({ role: enums(['user', 'assistant']), text: str() }),
    activity: list({ line: str() }),
    busy: bool(),
    proposal: obj({ id: str(), tool: str() }).nullable(),
  }),

  lifecycle: {
    attach: ({ intents }: any) => {
      wire = [];
      toolListener = (event: any) => {
        const { tool, phase } = event.detail;

        if (phase === 'start' || tool.startsWith('copilot.')) return;
        intents.logTool({ line: `${tool} ${phase === 'ok' ? '✓' : phase === 'proposal' ? '⏸ proposal' : '✗'}` });
      };
      document.addEventListener('janux:tool-call', toolListener);
    },
    detach: () => {
      if (toolListener) document.removeEventListener('janux:tool-call', toolListener);
    },
  },

  intents: {
    logTool: intent({
      guard: 'forbidden',
      input: schema({ line: str() }),
      run: ({ state, input }: any) => {
        state.activity.push({ line: input.line });
        if (state.activity.length > 6) state.activity = state.activity.slice(-6);
      },
    }),
    demo: intent({
      guard: 'forbidden',
      description: 'Run the scripted no-AI demo',
      run: ({ state }: any) => runDemo(state),
    }),
    send: intent({
      description: 'Send a message to the copilot',
      input: schema({ text: str().min(1) }),
      ready: ({ state }: any) => !state.busy,
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
      guard: 'forbidden',
      run: async ({ state }: any) => {
        if (!state.proposal) return;
        await (window as any).janux.approve(state.proposal.id);
        state.messages.push({ role: 'assistant', text: `Approved: ${state.proposal.tool} ✔` });
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
      <h3>✦ Copilot</h3>
      {state.messages.length === 0 ? (
        <div class="chips">
          {SUGGESTIONS.map((text) => (
            <button key={text} class="chip" onClick={intents.send.with({ text })}>
              {text}
            </button>
          ))}
          <button class="chip demo" onClick={intents.demo}>
            ▶ Demo without API key
          </button>
        </div>
      ) : null}
      <ol class="chat">
        {state.messages.map((message: any, index: number) => (
          <li key={String(index)} class={message.role}>
            {message.text}
          </li>
        ))}
      </ol>
      {state.activity.length > 0 ? (
        <ul class="activity">
          {state.activity.map((entry: any, index: number) => (
            <li key={String(index)}>→ {entry.line}</li>
          ))}
        </ul>
      ) : null}
      {state.proposal ? (
        <div class="proposal">
          <p>The copilot wants to run “{state.proposal.tool}”.</p>
          <button onClick={intents.approve}>Approve</button>
          <button onClick={intents.reject}>Reject</button>
        </div>
      ) : null}
      <form onSubmit={intents.send}>
        <input name="text" placeholder={state.busy ? 'Thinking…' : 'Ask the copilot'} />
        <button type="submit">Send</button>
      </form>
    </aside>
  ),
});
