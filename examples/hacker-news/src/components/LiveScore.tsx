import { component, int, intent, schema } from 'janux';
import { useQuery } from 'janux/client';
import { getItem } from '../server/hn.api';

/**
 * Client-side refresh through the query cache: the SSR points are seeded into
 * state, and each `refresh` bumps `checks`, which rotates the query key and
 * re-fetches the story through the `getItem` api stub.
 */
export const LiveScore = component({
  name: 'live-score',
  description: 'The story score, re-checkable client-side through the query cache.',
  state: schema({ id: int(), points: int(), checks: int() }),
  intents: {
    refresh: intent({
      description: 'Re-check the score against the server',
      run: ({ state }) => (state.checks += 1),
    }),
  },
  view: (bag: any) => {
    const { state, intents } = bag;
    const q = useQuery(bag, 'score', () => ({
      queryKey: ['item', state.id, state.checks],
      queryFn: () => getItem({ id: state.id }),
      // SSR already fetched this key and shipped it in the payload; declaring
      // it fresh for a minute is what turns that into zero requests on mount.
      // A `refresh` rotates the key, so a re-check is still a real request.
      staleTime: 60_000,
    }));
    const points = (q.data.value as any)?.points ?? state.points;
    // Only a user-triggered re-check shows progress: during SSR the query is
    // always pending, and that must not freeze "checking…" into the HTML.
    const checking = q.isFetching.value && state.checks > 0;

    return (
      <span class="score">
        <strong class="points">{points}</strong> points
        <button class="refresh" onClick={intents.refresh}>
          {checking ? 'checking…' : 'refresh'}
        </button>
        {state.checks > 0 ? <span class="checked">checked ×{state.checks}</span> : null}
      </span>
    );
  },
});
