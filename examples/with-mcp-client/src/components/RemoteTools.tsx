import { component, intent, schema, str } from 'janux';
import { useQuery } from 'janux/client';
import { callTool, listTools } from '../server/remote.api';

type RemoteToolRef = { name: string; description: string };
type Discovery = { available: boolean; url: string; tools: RemoteToolRef[]; error?: string };

const KEY = ['remote-tools'];

/**
 * The visible face of the outbound MCP client: the tools another server
 * exposes, discovered through `api.remote.listTools` (already filtered), and a
 * one-click invocation whose JSON result comes back over the same connection.
 */
export const RemoteTools = component({
  name: 'remote-tools',
  description: 'Lists the remote MCP tools discovered by the outbound client and invokes one on demand.',
  state: schema({ invoked: str().default(''), result: str().default(''), error: str().default('') }),

  intents: {
    invoke: intent({
      description: 'Invoke one discovered remote tool through the outbound MCP connection.',
      input: schema({ name: str().min(1), args: str().default('{}') }),
      run: async ({ state, input }: any) => {
        state.invoked = input.name;
        state.result = '';
        state.error = '';
        try {
          const outcome = await callTool({ name: input.name, args: input.args });

          state.result = JSON.stringify(outcome, null, 2);
        } catch (error) {
          state.error = String(error);
        }
      },
    }),
  },

  view: (bag: any) => {
    const { state, intents } = bag;
    const q = useQuery(bag, 'remoteTools', () => ({ queryKey: KEY, queryFn: () => listTools() as Promise<Discovery> }));
    const discovery = q.data.value;
    const tools = discovery?.tools ?? [];

    return (
      <section class="panel">
        <h2>Remote MCP tools</h2>
        {discovery ? (
          <p class={discovery.available ? 'status ok' : 'status down'}>
            {discovery.available
              ? `Connected to ${discovery.url} — ${tools.length} tools after the filter`
              : `Remote MCP server unreachable at ${discovery.url}: ${discovery.error}`}
          </p>
        ) : (
          <p class="status loading">Discovering remote tools…</p>
        )}
        <ul class="tools">
          {tools.map((tool) => (
            <li key={tool.name} class="tool">
              <code>{tool.name}</code>
              <span class="desc">{tool.description}</span>
              <button class="invoke" onClick={intents.invoke.with({ name: tool.name })}>
                Invoke
              </button>
            </li>
          ))}
        </ul>
        {state.invoked ? <p class="invoked">last invoked: {state.invoked}</p> : null}
        {state.result ? <pre class="result">{state.result}</pre> : null}
        {state.error ? (
          <p class="error" role="alert">
            {state.error}
          </p>
        ) : null}
      </section>
    );
  },
});
