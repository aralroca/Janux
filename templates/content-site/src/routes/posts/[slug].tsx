import { render, type Heading } from '@janux/content';
import { notFound, type PageMeta } from 'janux';
import { formatDate, publishedPost, publishedPosts } from '../../content';

/** The concrete pages: llms.txt and the sitemap read this list. */
export const staticParams = () => publishedPosts().map((post) => ({ slug: post.id }));

export function meta({ params }: { params: { slug: string } }): PageMeta {
  const post = publishedPost(params.slug);

  // No such post: the page calls notFound(), and `_404.tsx` brings its own meta.
  if (!post) return {};

  // `canonical` needs `siteUrl` in janux.config.ts to resolve — see index.tsx.
  return {
    title: `${post.data.title} — __APP_NAME__`,
    description: post.data.summary,
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

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = publishedPost(params.slug);

  // The route matched but nothing is published at it — a 404, not a page about
  // the absence of one. `notFound()` throws, so nothing below runs.
  if (!post) notFound();
  const { Content, headings } = await render(post);

  return (
    <article class="note">
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
      <header class="note-head">
        <p class="meta">
          <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
          <a class="md-link" href={`/posts/${post.id}.md`}>
            .md
          </a>
        </p>
        <p class="summary">{post.data.summary}</p>
        <p class="tags">
          {post.data.tags.map((tag) => (
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
