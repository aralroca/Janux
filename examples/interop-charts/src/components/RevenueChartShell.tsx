import { component, enums, int, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { RevenueChart } from './RevenueChart';

const SERIES = ['revenue', 'users'];

const POINTS = [
  { month: 'Jan', revenue: 120, users: 40 },
  { month: 'Feb', revenue: 165, users: 52 },
  { month: 'Mar', revenue: 143, users: 61 },
  { month: 'Apr', revenue: 198, users: 74 },
  { month: 'May', revenue: 231, users: 88 },
  { month: 'Jun', revenue: 205, users: 96 },
];

const Chart = foreign(RevenueChart, {
  name: 'revenue-chart',
  props: (own: any) => ({ points: own.state.points, hidden: own.state.hidden, selected: own.state.selected }),
  on: {
    // Recharts calls `onClick(data, index, event)` — the payload is the SECOND
    // argument, which is the case `on: { prop: 'intent' }` cannot reach at all.
    onPointClick: { intent: 'inspect', input: ({ args }: any) => ({ index: args[1] }) },
    onLegendClick: { intent: 'toggleSeries', input: ({ args }: any) => ({ key: String(args[0]?.dataKey) }) },
  },
});

/** The wrap-once pattern: Recharts draws this state; humans and agents share the intents. */
export const RevenueChartShell = component({
  name: 'chart',
  description: 'Six months of revenue and users. The chart is a foreign Recharts island; the data and controls are Janux.',
  state: schema({
    points: list(obj({ month: str(), revenue: int(), users: int() })).default(POINTS),
    hidden: list(str()).default([]),
    // -1 is "nothing selected": an int keeps the resource projection plain.
    selected: int().default(-1),
  }),
  intents: {
    toggleSeries: intent({
      description: 'Show or hide one series',
      input: schema({ key: enums(SERIES) }),
      run: ({ state, input }: any) => {
        state.hidden = state.hidden.includes(input.key)
          ? state.hidden.filter((key: string) => key !== input.key)
          : [...state.hidden, input.key];
      },
    }),
    inspect: intent({
      description: 'Select one month by its position (0-5)',
      input: schema({ index: int().min(0).max(5).default(0) }),
      run: ({ state, input }: any) => (state.selected = input.index),
    }),
    reset: intent({
      description: 'Show every series and clear the selection. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => {
        state.hidden = [];
        state.selected = -1;
      },
    }),
  },
  view: ({ state }: any) => (
    <section class="chart-shell">
      <p class="chart-summary">
        {`${SERIES.length - state.hidden.length}/${SERIES.length} series · ${state.points.length} months`}
        {state.selected >= 0 ? ` · ${state.points[state.selected].month}: ${state.points[state.selected].revenue}` : ' · nothing selected'}
      </p>
      <Chart state={state} />
    </section>
  ),
});
