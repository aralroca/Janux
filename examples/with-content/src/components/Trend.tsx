import { component, int, list, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { TrendChart } from './TrendChart';

/** The React root, mounted unchanged. Tracked props come from the shell's state. */
const TrendIsland = foreign(TrendChart, {
  name: 'trend-chart',
  props: (own: any) => ({ label: own.state.label, points: own.state.points }),
});

/**
 * The wrap-once pattern (RFC §1.5): a foreign root is opaque to agents, so it
 * is mounted inside a Janux island whose state is the thing worth reading. From
 * a note's side this is one tag — the runtime boundary is the app's business.
 */
export const Trend = component({
  name: 'trend',
  description: 'A sparkline of weekly figures, rendered by a React component.',
  state: schema({
    label: str().default('Trend'),
    points: list(int()).default([]),
  }),
  view: ({ state }) => (
    <section class="trend-shell">
      <TrendIsland state={state} />
    </section>
  ),
});
