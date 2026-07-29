import { component, intent, list, schema, str } from 'janux';

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

/** Re-reads the manifest. Assigns only on change to avoid useless re-renders. */
async function refresh(state: any): Promise<void> {
  const manifest = await fetchManifest();
  const tools = manifest.tools.map((tool: any) => ({
    name: tool.name,
    guard: tool.guard,
    description: tool.description ?? '',
    example: tool.input ? JSON.stringify(exampleInput(tool.input)) : '',
  }));

  if (JSON.stringify(tools) !== JSON.stringify(state.tools)) state.tools = tools;
}

export const AgentPanel = component({
  name: 'agent-panel',
  description: 'Live view of this page’s agent surface: every tool, its guard, and an agent-origin trigger.',

  state: schema({
    tools: list({ name: str(), guard: str(), description: str(), example: str() }),
    last: str(),
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

        state.last = result?.status === 'proposal' ? `proposal ${result.id}` : JSON.stringify(result ?? null);
      },
    }),
  },

  lifecycle: {
    attach: ({ intents }: any) => {
      setTimeout(() => bridge() && intents.sync(), 60);
    },
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
          <button onClick={intents.callTool.with({ tool: tool.name, example: tool.example })}>
            Call as agent
          </button>
        </div>
      ))}
      {state.last ? <pre class="last-result">{state.last}</pre> : null}
    </aside>
  ),
});
