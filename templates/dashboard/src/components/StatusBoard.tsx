import { component, intent, source, onEvent, schema, str, bool, list } from 'janux';
import { board, acknowledge, resolve, maintenance } from '../server/ops.api';

const KPIS = [
  { label: 'Open', match: (entry: any) => entry.status === 'open' },
  { label: 'Acknowledged', match: (entry: any) => entry.status === 'acknowledged' },
  { label: 'Resolved', match: (entry: any) => entry.status === 'resolved' },
  { label: 'Critical', match: (entry: any) => entry.severity === 'critical' && entry.status !== 'resolved' },
];

function Kpis({ incidents }: { incidents: any[] }) {
  return (
    <div class="kpis">
      {KPIS.map((kpi) => (
        <div key={kpi.label} class="kpi">
          <strong>{incidents.filter(kpi.match).length}</strong>
          <span>{kpi.label}</span>
        </div>
      ))}
    </div>
  );
}

function IncidentRow({ entry, intents }: { entry: any; intents: any }) {
  return (
    <tr key={entry.id} class={entry.severity}>
      <td>
        <code>{entry.id}</code>
      </td>
      <td>{entry.service}</td>
      <td>{entry.title}</td>
      <td>
        <span class={`badge ${entry.status}`}>{entry.status}</span>
      </td>
      <td>
        {entry.status === 'open' ? <button onClick={intents.acknowledge.with({ id: entry.id })}>Acknowledge</button> : null}
        {entry.status === 'acknowledged' ? <button onClick={intents.resolve.with({ id: entry.id })}>Resolve</button> : null}
      </td>
    </tr>
  );
}

export const StatusBoard = component({
  name: 'board',
  description: 'The ops board: incident triage and the confirm-guarded maintenance switch.',

  state: schema({ log: list({ line: str() }) }),

  sources: {
    ops: source({
      description: 'Maintenance state and current incidents',
      query: () => board({}),
      refresh: onEvent('ops.changed'),
    }),
  },

  emits: { 'ops.changed': schema({}) },

  intents: {
    acknowledge: intent({
      description: 'Take ownership of an open incident.',
      input: schema({ id: str() }),
      run: async ({ state, input, emit }: any) => {
        const updated: any = await acknowledge({ id: input.id });

        state.log.push({ line: `${updated.id} acknowledged` });
        emit('ops.changed', {});
      },
    }),

    resolve: intent({
      description: 'Mark an acknowledged incident as resolved.',
      input: schema({ id: str() }),
      run: async ({ state, input, emit }: any) => {
        const updated: any = await resolve({ id: input.id });

        state.log.push({ line: `${updated.id} resolved` });
        emit('ops.changed', {});
      },
    }),

    maintenance: intent({
      description: 'Flip the whole site into (or out of) maintenance mode. Customer-visible.',
      guard: 'confirm',
      input: schema({ enabled: bool() }),
      run: async ({ state, input, emit }: any) => {
        const updated: any = await maintenance({ enabled: input.enabled, reason: 'planned maintenance window' });

        state.log.push({ line: `maintenance ${updated.enabled ? 'on' : 'off'}` });
        emit('ops.changed', {});
      },
    }),
  },

  view: ({ state, sources, intents }: any) => (
    <section class="board">
      {sources.ops.pending ? (
        <p>Loading the board…</p>
      ) : (
        <>
          {sources.ops.value.maintenance ? (
            <p class="maintenance" role="alert">
              🚧 Maintenance mode is ON — {sources.ops.value.reason}
            </p>
          ) : null}
          <Kpis incidents={sources.ops.value.incidents} />
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Service</th>
                <th>Incident</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>{sources.ops.value.incidents.map((entry: any) => IncidentRow({ entry, intents }))}</tbody>
          </table>
          <button class="danger" onClick={intents.maintenance.with({ enabled: !sources.ops.value.maintenance })}>
            {sources.ops.value.maintenance ? 'End maintenance' : 'Start maintenance'}
          </button>
        </>
      )}
      {state.log.length > 0 ? (
        <ul class="log">
          {state.log.map((entry: any, index: number) => (
            <li key={String(index)}>→ {entry.line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  ),
});
