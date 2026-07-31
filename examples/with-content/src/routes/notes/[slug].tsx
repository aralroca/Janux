import { render, type Heading } from '@janux/content';
import { notFound, type PageMeta } from 'janux';
import { contentComponents, formatDate, publishedNote, publishedNotes } from '../../content';

/** The concrete pages: the prerender, llms.txt and the sitemap all read this list. */
export const staticParams = () => publishedNotes().map((note) => ({ slug: note.id }));

export function meta({ params }: { params: { slug: string } }): PageMeta {
  const note = publishedNote(params.slug);

  // No such note: the page calls notFound(), and `_404.tsx` brings its own meta.
  if (!note) return {};

  return {
    title: `${note.data.title} — Janux content collections`,
    description: note.data.summary,
    canonical: `/notes/${note.id}`,
    og: { type: 'article' },
  };
}

function Toc({ headings }: { headings: Heading[] }) {
  const sections = headings.filter((heading) => heading.depth === 2);

  if (sections.length === 0) return null;

  return (
    <aside class="toc">
      <p class="toc-title">On this page</p>
      <ul>
        {sections.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default async function NotePage({ params }: { params: { slug: string } }) {
  const note = publishedNote(params.slug);

  // The route matched but nothing is published at it — a 404, not a page about
  // the absence of one. `notFound()` throws, so nothing below runs.
  if (!note) notFound();
  const { Content, headings } = await render(note, { components: contentComponents });

  return (
    <article class="note">
      <p class="crumb">
        <a href="/">← All notes</a>
      </p>
      <header class="note-head">
        <p class="meta">
          <time dateTime={note.data.date}>{formatDate(note.data.date)}</time>
          <a class="md-link" href={`/notes/${note.id}.md`}>
            .md
          </a>
        </p>
        <p class="summary">{note.data.summary}</p>
        <p class="tags">
          {note.data.tags.map((tag) => (
            <span key={tag} class="tag">
              {tag}
            </span>
          ))}
        </p>
      </header>
      <div class="note-grid">
        <div class="note-body">
          <Content />
        </div>
        <Toc headings={headings} />
      </div>
    </article>
  );
}
