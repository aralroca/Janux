import { defineCollection, getCollection, getEntry, type CollectionEntry } from '@janux/content';
import { bool, list, schema, str } from 'janux';
import { Poll } from './components/Poll';
import { Trend } from './components/Trend';

/**
 * The collection: a directory of notes whose frontmatter is checked by the same
 * `schema()` that types an island's state. `str()`, `list()` and `bool()` are
 * not content builders — they are the framework's, and `validate()` runs on
 * this header exactly as it runs on an intent's input.
 */
export const notes = defineCollection({
  dir: 'content/notes',
  schema: schema({
    title: str(),
    date: str(),
    summary: str(),
    tags: list(str()).default([]),
    draft: bool().default(false),
  }),
});

export type Note = CollectionEntry<typeof notes>;

/** Published notes, newest first — the index order, the prerender list and the llms.txt index. */
export function publishedNotes(): Note[] {
  return getCollection(notes, (note) => !note.data.draft).sort((first, second) =>
    second.data.date.localeCompare(first.data.date),
  );
}

/** A published note by slug. A draft is not found, so it 404s like any unwritten URL. */
export function publishedNote(slug: string): Note | undefined {
  const note = getEntry(notes, slug);

  return note?.data.draft ? undefined : note;
}

/**
 * What a note may mount. Passing components in explicitly — rather than letting
 * content import them — is what keeps a markdown file from reaching anywhere the
 * app has not offered it.
 */
export const contentComponents = { Poll, Trend };

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** `2026-07-04` → `Jul 4, 2026`; the raw value stays in `<time datetime>`. */
export function formatDate(date: string): string {
  return DATE_FORMAT.format(new Date(date));
}
