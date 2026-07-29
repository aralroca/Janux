import { api } from '@janux/server';
import { int, schema } from 'janux';
import { STORIES, summaries } from '../data/stories';

/**
 * Small artificial latency so the streaming is observable: the front page
 * paints its skeleton first, then the list swaps in from the same response.
 */
const LIST_LATENCY_MS = 400;
const ITEM_LATENCY_MS = 150;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const listStories = api({
  description: 'Every front-page story with its rank data (title, points, comment count).',
  run: async () => {
    await delay(LIST_LATENCY_MS);

    return summaries();
  },
});

export const getItem = api({
  description: 'One story with its full nested comment tree, or null if it does not exist.',
  input: schema({ id: int() }),
  run: async ({ input }) => {
    await delay(ITEM_LATENCY_MS);

    return STORIES.find((story) => story.id === input.id) ?? null;
  },
});
