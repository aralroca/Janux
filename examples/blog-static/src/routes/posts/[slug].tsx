import type { PageMeta } from 'janux';
import { formatDate, postBySlug, posts, readingMinutes } from '../../content';
import { markdownToHtml } from '../../markdown';

/** Enumerates the concrete pages: the static prerender, llms.txt and the sitemap all read this. */
export const staticParams = () => posts().map(({ slug }) => ({ slug }));

export function meta({ params }: { params: { slug: string } }): PageMeta {
  const post = postBySlug(params.slug);

  if (!post) return { title: 'Post not found — Janux Static Blog', robots: 'noindex' };

  return {
    title: `${post.title} — Janux Static Blog`,
    description: post.description,
    canonical: `/posts/${post.slug}`,
  };
}

function NotFound({ slug }: { slug: string }) {
  return (
    <article class="post">
      <header class="post-head">
        <h1>Post not found</h1>
        <p class="lede">No post named “{slug}”.</p>
      </header>
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
    </article>
  );
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  if (!post) return <NotFound slug={params.slug} />;

  return (
    <article class="post">
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
      <header class="post-head">
        <p class="meta">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span class="sep">·</span>
          <span>{readingMinutes(post)} min read</span>
          <a class="md-link" href={`/posts/${post.slug}.md`}>
            .md
          </a>
        </p>
        <h1>{post.title}</h1>
        <p class="lede">{post.description}</p>
      </header>
      <div class="post-body" dangerHTML={markdownToHtml(post.body)} />
      <footer class="post-foot">
        <a href="/">← All posts</a>
        <span>
          Read this page as <a href={`/posts/${post.slug}.md`}>markdown</a>
        </span>
      </footer>
    </article>
  );
}
