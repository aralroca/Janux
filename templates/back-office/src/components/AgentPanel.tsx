import { component, intent, list, schema, str } from 'janux';

let stopAudit: (() => void) | undefined;

function bridge(): any {
  return (window as any).janux;
}

const SERVER_PREFIX = 'api.';

/**
 * A valid example payload from a tool's JSON Schema input. An `enum` wins over a
 * `default`: the schema's default is what the tool means in general, the enum is
 * what it accepts right now (`options()`), and an example must be runnable today.
 */
function exampleInput(input: any): Record<string, unknown> {
  const entries = Object.entries(input?.properties ?? {}).map(([key, prop]: [string, any]) => {
    if (prop.enum?.length) return [key, prop.enum[0]];
    if (prop.default !== undefined) return [key, prop.default];
    if (prop.type === 'integer' || prop.type === 'number') return [key, 1];

    return [key, 'example'];
  });

  return Object.fromEntries(entries);
}

/** The same manifest an agent gets over HTTP — islands not yet resumed included. */
async function fetchManifest(): Promise<any> {
  const href = document.querySelector('link[rel="janux-manifest"]')?.getAttribute('href');

  return href ? fetch(href).then((response) => response.json()) : bridge().manifest();
}

/**
 * Server `api.*` tools only exist in the HTTP manifest; the page's own tools are
 * read from the mounted tree, where their schemas are resolved against the live
 * state — that is the only copy that knows which payment is still pending.
 */
async function liveTools(): Promise<any[]> {
  const remote = await fetchManifest();
  const local = bridge().manifest();

  return [...local.tools, ...remote.tools.filter((tool: any) => tool.name.startsWith(SERVER_PREFIX))];
}

/** Re-reads the manifest. Assigns only on change to avoid useless re-renders. */
async function refresh(state: any): Promise<void> {
  const tools = (await liveTools()).map((tool: any) => ({
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

  /**
   * Every executed intent lands on `janux:audit`, and any of them may change
   * what the surface offers — a sent payment leaves the list of sendable ids.
   * Re-syncing there keeps the shown payloads runnable; the panel's own audit
   * entries are skipped, or syncing would feed itself forever.
   */
  lifecycle: {
    attach: ({ intents }: any) => {
      const resync = (event: Event) => {
        if (!(event as CustomEvent<any>).detail.tool.startsWith('agent-panel.')) intents.sync();
      };

      setTimeout(() => bridge() && intents.sync(), 60);
      document.addEventListener('janux:audit', resync);
      stopAudit = () => document.removeEventListener('janux:audit', resync);
    },
    detach: () => stopAudit?.(),
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
