import { component, intent, schema, str, list } from 'janux';

let stopListening: (() => void) | undefined;

function bridge(): any {
  return (window as any).janux;
}

/** Builds a valid example payload from a tool's JSON Schema input. */
function exampleInput(input: any): Record<string, unknown> {
  const entries = Object.entries(input?.properties ?? {}).map(([key, prop]: [string, any]) => {
    if (prop.default !== undefined) return [key, prop.default];
    if (prop.type === 'integer' || prop.type === 'number') return [key, 1];
    if (prop.enum) return [key, prop.enum[0]];

    return [key, 'example'];
  });

  return Object.fromEntries(entries);
}

/** The same manifest an agent gets over HTTP — islands not yet resumed included. */
async function fetchManifest(): Promise<any> {
  const href = document.querySelector('link[rel="janux-manifest"]')?.getAttribute('href');

  return href ? fetch(href).then((response) => response.json()) : bridge().manifest();
}

/** Re-reads the live manifest + resource. Assigns only on change to avoid useless re-renders. */
async function refresh(state: any): Promise<void> {
  const manifest = await fetchManifest();
  const tools = manifest.tools.map((tool: any) => ({
    name: tool.name,
    guard: tool.guard,
    description: tool.description ?? '',
    example: tool.input ? JSON.stringify(exampleInput(tool.input)) : '',
  }));

  if (JSON.stringify(tools) !== JSON.stringify(state.tools)) state.tools = tools;
  const target = manifest.resources.find((entry: any) => !entry.uri.includes('agent-panel'));

  if (!target) return;
  const resource: any = await bridge().read(target.uri);
  const snapshot = JSON.stringify({ state: resource.state, derived: resource.derived }, null, 2);

  state.uri = target.uri;
  if (snapshot !== state.resource) state.resource = snapshot;
}

export const AgentPanel = component({
  name: 'agent-panel',
  description: 'Live view of this page’s agent surface: tools, resource, approvals.',

  state: schema({
    tools: list({ name: str(), guard: str(), description: str(), example: str() }),
    uri: str(),
    resource: str(),
    proposal: schema({ id: str(), tool: str() }).nullable(),
  }),

  intents: {
    sync: intent({
      description: 'Refresh the panel from the live manifest',
      guard: 'forbidden',
      run: ({ state }: any) => refresh(state),
    }),
    callTool: intent({
      description: 'Invoke a tool exactly like an agent would',
      guard: 'forbidden',
      input: schema({ tool: str(), example: str() }),
      run: async ({ state, input }: any) => {
        const result: any = await bridge()
          .call(input.tool, input.example ? JSON.parse(input.example) : undefined)
          .catch((error: unknown) => ({ error: String(error) }));

        if (result?.status === 'proposal') state.proposal = { id: result.id, tool: input.tool };
        await refresh(state);
      },
    }),
    approve: intent({
      guard: 'forbidden',
      run: async ({ state }: any) => {
        await bridge().approve(state.proposal.id);
        state.proposal = null;
        await refresh(state);
      },
    }),
    reject: intent({
      guard: 'forbidden',
      run: ({ state }: any) => {
        bridge().reject(state.proposal?.id);
        state.proposal = null;
      },
    }),
  },

  lifecycle: {
    // The counter is also operated directly by humans — re-sync after any click settles.
    attach: ({ intents }: any) => {
      const resync = () => setTimeout(() => bridge() && intents.sync(), 60);

      resync();
      document.addEventListener('click', resync);
      stopListening = () => document.removeEventListener('click', resync);
    },
    detach: () => stopListening?.(),
  },

  view: ({ state, intents }: any) => (
    <aside class="agent-pane">
      <h2>🤖 What the agent sees</h2>
      {state.tools.map((tool: any) => (
        <div key={tool.name} class="tool-row">
          <code>{tool.name}</code>
          <span class={`guard ${tool.guard}`}>{tool.guard}</span>
          <small>{tool.description}</small>
          {tool.example ? <code class="example">{tool.example}</code> : null}
          <button onClick={intents.callTool} data-input={JSON.stringify({ tool: tool.name, example: tool.example })}>
            Call as agent
          </button>
        </div>
      ))}
      {state.resource ? (
        <div class="resource-block">
          <h2>
            Resource <code>{state.uri}</code>
          </h2>
          <pre class="resource">{state.resource}</pre>
        </div>
      ) : null}
      {state.proposal ? (
        <div class="proposal-card" role="alert">
          <p class="proposal-title">⏸ Approval required</p>
          <p>
            The agent wants to run <code>{state.proposal.tool}</code>
          </p>
          <p class="proposal-why">guard: confirm — nothing happens until you decide.</p>
          <div class="proposal-actions">
            <button class="approve" onClick={intents.approve}>
              Approve
            </button>
            <button class="reject" onClick={intents.reject}>
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  ),
});
