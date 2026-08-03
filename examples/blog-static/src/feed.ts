import type { FeedConfig } from 'janux';
import { allPosts } from './content';

/**
 * The RSS feed, at `GET /rss.xml` — the same idea as `llms.txt` and the `.md`
 * projections, for human readers. `items()` runs when the feed is first asked
 * for, so it reads the collection once and the prerender writes the result
 * beside the pages.
 */
export default {
  description: 'A fully static markdown blog, built with Janux.',
  items: () =>
    allPosts().map((post) => ({
      url: `/posts/${post.id}`,
      title: post.data.title,
      description: post.data.description,
      date: post.data.date,
    })),
} satisfies FeedConfig;
