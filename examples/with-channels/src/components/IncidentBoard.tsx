import { component, intent, source, onEvent, schema, str } from 'janux';
import { list_incidents } from '../server/oncall.api';

/**
 * The board, and the half of the surface that only exists in a browser.
 *
 * `focus` moves a highlight on a page somebody is looking at. There is nothing
 * for it to do on a webhook, which is precisely why it is here: the same agent
 * is offered this intent in the browser and told it is unavailable on a
 * channel, instead of calling it into the void.
 */
export const IncidentBoard = component({
  name: 'incident-board',
  description: 'The on-call board: open incidents and the one currently in focus.',

  state: schema({ focused: str().default('') }),

  sources: {
    board: source({
      description: 'Incidents on the board',
      query: () => list_incidents({}),
      refresh: onEvent('oncall.changed'),
    }),
  },

  emits: { 'oncall.changed': schema({}) },

  intents: {
    focus: intent({
      description: 'Highlight one incident on the board for whoever is watching the screen.',
      input: schema({ id: str() }),
      run: ({ state, input }: any) => {
        state.focused = input.id;
      },
    }),
  },

  view: ({ state, board }: any) => (
    <section class="board">
      <h2>Incidents</h2>
      <ul class="incidents">
        {(board?.incidents ?? []).map((incident: any) => (
          <li key={incident.id} class={state.focused === incident.id ? 'incident focused' : 'incident'}>
            <strong>{incident.id}</strong> — {incident.service} (sev {incident.severity}), {incident.status}
            <span class="summary">{incident.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  ),
});
