import { component, intent, schema, str } from 'janux';
import { useQuery } from 'janux/client';
import { callTool, listTools } from '../server/remote.api';
import { connected, head, offline, type Discovery } from './remote-view';

const KEY = ['remote-tools'];

/** MCP results arrive as content blocks; the text one is what a human reads. */
function readable(outcome: any): string {
  const text = outcome?.content?.[0]?.text;

  return typeof text === 'string' ? text : JSON.stringify(outcome, null, 2);
}

/**
 * The visible face of the outbound MCP client: the tools another server
 * exposes, discovered through `api.remote.listTools` (already filtered), and a
 * one-click invocation whose result comes back over the same connection.
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
          state.result = readable(await callTool({ name: input.name, args: input.args }));
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
    const down = Boolean(discovery && !discovery.available);

    return (
      <section class={down ? 'card is-down' : 'card'}>
        {head(discovery)}
        {discovery ? null : <p class="loading">Discovering the remote server's tools…</p>}
        {discovery?.available ? connected(discovery, intents.invoke) : null}
        {down ? offline(discovery!) : null}
        {state.result || state.error ? (
          <div class="outcome">
            <p class="outcome-head">
              <code>tools/call</code> → <code>{state.invoked}</code>
            </p>
            {state.result ? <pre class="result">{state.result}</pre> : null}
            {state.error ? (
              <p class="error" role="alert">
                {state.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  },
});
