import { bool, component, enums, int, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { DataGrid } from './DataGrid';

const COLUMNS = ['name', 'team', 'score'];

const ROSTER = [
  { id: 'ada', name: 'Ada', team: 'Core', score: 91 },
  { id: 'grace', name: 'Grace', team: 'Core', score: 78 },
  { id: 'linus', name: 'Linus', team: 'Infra', score: 84 },
  { id: 'margaret', name: 'Margaret', team: 'Infra', score: 96 },
  { id: 'katherine', name: 'Katherine', team: 'Data', score: 88 },
  { id: 'barbara', name: 'Barbara', team: 'Data', score: 73 },
];

/**
 * TanStack's `on[State]Change` contract: the callback gets the next value OR an
 * updater function to apply to the current one. Resolving it needs the previous
 * value, which is why the mapped `on:` form hands the mapper `own` alongside the
 * callback arguments — the previous value lives in the island, not in React.
 */
function resolve(next: unknown, current: unknown): any {
  return typeof next === 'function' ? (next as (prev: unknown) => unknown)(current) : next;
}

const Grid = foreign(DataGrid, {
  name: 'data-grid',
  props: (own: any) => ({ rows: own.state.rows, sorting: own.state.sorting, filter: own.state.filter }),
  on: {
    onSortingChange: {
      intent: 'sort',
      input: ({ args, own }: any) => {
        const [first] = resolve(args[0], own.state.sorting);

        return { column: first.id, desc: first.desc };
      },
    },
    onGlobalFilterChange: {
      intent: 'filter',
      input: ({ args, own }: any) => ({ query: resolve(args[0], own.state.filter) }),
    },
  },
});

/** The wrap-once pattern: the React table renders this state; humans and agents share the intents. */
export const DataGridShell = component({
  name: 'grid',
  description: 'A roster table. Rows, sorting and filter live in typed state; the table is a foreign React island.',
  state: schema({
    rows: list(obj({ id: str(), name: str(), team: str(), score: int() })).default(ROSTER),
    // Stored in the shape the renderer consumes, so the island's array can be
    // handed to TanStack as-is. Rebuilding it per render is what makes a
    // controlled table loop; see the interop matrix.
    sorting: list(obj({ id: enums(COLUMNS), desc: bool() })).default([{ id: 'score', desc: true }]),
    filter: str().default(''),
  }),
  intents: {
    sort: intent({
      description: 'Sort the table by a column',
      // The enum IS the contract: an agent cannot sort by a column that does not
      // exist and get a silent no-op, and the generated example payload names a
      // real one. `desc` carries a default so that payload is complete.
      input: schema({ column: enums(COLUMNS), desc: bool().default(false) }),
      run: ({ state, input }: any) => (state.sorting = [{ id: input.column, desc: input.desc }]),
    }),
    filter: intent({
      description: 'Show only rows matching this text',
      input: schema({ query: str() }),
      run: ({ state, input }: any) => (state.filter = input.query),
    }),
    reset: intent({
      description: 'Clear the filter and sort by score again. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => {
        state.filter = '';
        state.sorting = [{ id: 'score', desc: true }];
      },
    }),
  },
  view: ({ state }: any) => (
    <section class="grid-shell">
      <p class="grid-summary">
        {`${state.rows.length} rows · sorted by ${state.sorting[0].id} ${state.sorting[0].desc ? 'desc' : 'asc'}`}
        {state.filter ? ` · filter "${state.filter}"` : ''}
      </p>
      <Grid state={state} />
    </section>
  ),
});
