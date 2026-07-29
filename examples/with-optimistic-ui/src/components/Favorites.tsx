import { component, intent, schema, str } from 'janux';
import { getQueryClient, mutation, useQuery } from 'janux/client';
import { addFavorite, listFavorites, resetFavorites } from '../server/favorites.api';

type Favorite = { name: string; pending?: boolean };

const ITEMS = ['Aurora', 'Comet', 'Eclipse', 'Nebula', 'Pulsar', 'Quasar'];
const KEY = ['favorites'];
const client = getQueryClient();

/**
 * The optimistic-ui recipe verbatim: `onMutate` paints the star into the cache
 * before the server answers and snapshots the previous list; `onError` puts the
 * snapshot back; `onSettled` re-syncs with server truth either way.
 */
const starFavorite = mutation({
  mutationFn: (vars: { name: string }) => addFavorite(vars),
  onMutate: (vars) => {
    const previous = client.getQueryData<Favorite[]>(KEY) ?? [];

    client.setQueryData<Favorite[]>(KEY, [...previous, { name: vars.name, pending: true }]);

    return { previous };
  },
  onError: (_error, _vars, ctx) => client.setQueryData(KEY, ctx?.previous ?? []),
  onSettled: () => client.invalidateQueries(KEY),
});

export const Favorites = component({
  name: 'favorites',
  description: 'A favorites list where starring lands instantly and a server rejection rolls it back.',
  state: schema({ notice: str().default('') }),

  intents: {
    star: intent({
      description: 'Mark an item as favorite. Optimistic: the server may still reject and roll it back.',
      input: schema({ name: str().min(1) }),
      run: async ({ state, input }: any) => {
        state.notice = '';
        await starFavorite.mutate({ name: input.name }).catch(() => {
          state.notice = `The server rejected "${input.name}" — the star was rolled back.`;
        });
      },
    }),
    reset: intent({
      description: 'Clear all favorites and the failure counter, restarting the demo.',
      run: async ({ state }: any) => {
        state.notice = '';
        await resetFavorites();
        await client.invalidateQueries(KEY);
      },
    }),
  },

  view: (bag: any) => {
    const { state, intents } = bag;
    const q = useQuery(bag, 'favorites', () => ({ queryKey: KEY, queryFn: () => listFavorites() as Promise<Favorite[]> }));
    const favorites = q.data.value ?? [];
    const starred = new Set(favorites.map((fav) => fav.name));
    const saving = new Set(favorites.filter((fav) => fav.pending).map((fav) => fav.name));
    // Optimism means painting the FINAL state instantly: an in-flight save
    // already reads "★ Starred" — the rollback is what reports a rejection.
    // 'saving' stays as a DOM marker (tests observe the window), same skin.
    const starState = (name: string) => (saving.has(name) ? 'saving' : starred.has(name) ? 'starred' : 'idle');
    const starLabel = { saving: '★ Starred', starred: '★ Starred', idle: '☆ Star' };

    return (
      <section class="board">
        <ul class="items">
          {ITEMS.map((name) => (
            <li key={name} class="row">
              <span>{name}</span>
              <button
                class={`star ${starState(name)}`}
                disabled={starred.has(name) || starFavorite.isPending.value}
                onClick={intents.star.with({ name })}
              >
                {starLabel[starState(name)]}
              </button>
            </li>
          ))}
        </ul>
        <h2>Favorites</h2>
        {q.isPending.value ? (
          <p class="loading">Loading…</p>
        ) : (
          <ul class="favorites">
            {favorites.map((fav) => (
              <li key={fav.name} class={fav.pending ? 'fav pending' : 'fav'}>
                {fav.name}
              </li>
            ))}
          </ul>
        )}
        <p class="count">favorites:{favorites.length}</p>
        {state.notice ? (
          <p class="notice" role="alert">
            {state.notice}
          </p>
        ) : null}
        <button class="reset" onClick={intents.reset}>
          Reset demo
        </button>
      </section>
    );
  },
});
