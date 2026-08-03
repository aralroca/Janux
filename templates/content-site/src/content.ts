import { defineCollection, getCollection, getEntry, type CollectionEntry } from '@janux/content';
import { bool, list, schema, str } from 'janux';

/**
 * The collection: a directory of posts whose frontmatter is checked by the same
 * `schema()` that types an island's state — a bad header fails the build, not
 * the reader.
 */
export const posts = defineCollection({
  dir: 'content/posts',
  schema: schema({
    title: str(),
    date: str(),
    summary: str(),
    tags: list(str()).default([]),
    draft: bool().default(false),
  }),
});

export type Post = CollectionEntry<typeof posts>;

/** Published posts, newest first — the index order, the search corpus and the llms.txt index. */
export function publishedPosts(): Post[] {
  return getCollection(posts, (post) => !post.data.draft).sort((first, second) =>
    second.data.date.localeCompare(first.data.date),
  );
}

/** A published post by slug. A draft is not found, so it 404s like any unwritten URL. */
export function publishedPost(slug: string): Post | undefined {
  const post = getEntry(posts, slug);

  return post?.data.draft ? undefined : post;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** `2026-07-04` → `Jul 4, 2026`; the raw value stays in `<time datetime>`. */
export function formatDate(date: string): string {
  return DATE_FORMAT.format(new Date(date));
}
