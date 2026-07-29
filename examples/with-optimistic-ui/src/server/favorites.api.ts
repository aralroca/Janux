import { api } from '@janux/server';
import { schema, str } from 'janux';

/**
 * In-memory favorites plus a deterministic failure: every 3rd `addFavorite`
 * call rejects on purpose, so the demo can exhibit the optimistic rollback.
 * The artificial latency keeps the optimistic window wide enough to watch.
 */
const LATENCY_MS = 600;

let favorites: { name: string }[] = [];
let calls = 0;

const settle = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export const listFavorites = api({
  description: 'List the favorites currently saved on the server.',
  run: () => favorites,
});

export const addFavorite = api({
  description: 'Save one favorite. Every 3rd call fails on purpose to exercise the rollback.',
  input: schema({ name: str().min(1) }),
  run: async ({ input }) => {
    calls += 1;
    const rejected = calls % 3 === 0;

    await settle();
    if (rejected) throw new Error(`The server rejected "${input.name}" (save #${calls})`);
    if (!favorites.some((fav) => fav.name === input.name)) favorites = [...favorites, { name: input.name }];

    return favorites;
  },
});

export const resetFavorites = api({
  description: 'Clear all favorites and the failure counter (demo reset).',
  run: () => {
    favorites = [];
    calls = 0;

    return favorites;
  },
});
