import { defineCollection, getCollection, getEntry, type CollectionEntry } from '@janux/content';
import { schema, str } from 'janux';

/**
 * The posts, as a content collection. The frontmatter is checked by the same
 * `schema()` that types a component's state, so a post missing its `date` fails
 * the build instead of sorting itself to the bottom of the index.
 */
export const posts = defineCollection({
  dir: 'content',
  schema: schema({ title: str(), date: str(), description: str() }),
});

export type Post = CollectionEntry<typeof posts>;

/** Every post, newest first — the index order and the `staticParams` source. */
export function allPosts(): Post[] {
  return getCollection(posts).sort((first, second) => second.data.date.localeCompare(first.data.date));
}

export function postBySlug(slug: string): Post | undefined {
  return getEntry(posts, slug);
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** `2026-07-20` → `Jul 20, 2026`; the raw value stays in `<time datetime>`. */
export function formatDate(date: string): string {
  return date ? DATE_FORMAT.format(new Date(date)) : '';
}

/** Rough byline figure at 200 words a minute, never below one minute. */
export function readingMinutes(post: Post): number {
  return Math.max(1, Math.round(post.body.split(/\s+/).length / 200));
}
