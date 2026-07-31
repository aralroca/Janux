import type { PageMeta } from 'janux';
import { formatDate, publishedNotes, type Note } from '../content';

export const meta: PageMeta = {
  title: 'Field notes — Janux content collections',
  description: 'Markdown and MDX notes whose frontmatter is validated by the same schema system as component state.',
  canonical: '/',
};

function NoteCard({ note }: { note: Note }) {
  return (
    <article class="note-card">
      <p class="meta">
        <time dateTime={note.data.date}>{formatDate(note.data.date)}</time>
        {note.format === 'mdx' ? <span class="format">MDX</span> : null}
      </p>
      <h2>
        <a href={`/notes/${note.id}`}>{note.data.title}</a>
      </h2>
      <p class="summary">{note.data.summary}</p>
      <p class="tags">
        {note.data.tags.map((tag) => (
          <span key={tag} class="tag">
            {tag}
          </span>
        ))}
      </p>
    </article>
  );
}

export default function Index() {
  return (
    <>
      <header class="page-head">
        <h1>Field notes</h1>
        <p class="lede">
          A content collection: every note is a file, its header is validated by <code>schema()</code>, and the ones
          written as <code>.mdx</code> mount real components.
        </p>
      </header>
      <section class="note-list">
        {publishedNotes().map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </section>
    </>
  );
}
