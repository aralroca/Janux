import { notFound, type PageMeta } from 'janux';
import { allPosts, formatDate, postBySlug, readingMinutes } from '../../content';
import { markdownToHtml } from '../../markdown';

/** Enumerates the concrete pages: the static prerender, llms.txt and the sitemap all read this. */
export const staticParams = () => allPosts().map(({ id }) => ({ slug: id }));

export function meta({ params }: { params: { slug: string } }): PageMeta {
  const post = postBySlug(params.slug);

  // No such post: the render calls notFound(), and `_404.tsx` brings its own meta.
  if (!post) return {};

  return {
    title: `${post.data.title} — Janux Static Blog`,
    description: post.data.description,
    canonical: `/posts/${post.id}`,
  };
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  // The route matched, but there is no such post: that is a 404, not a page
  // about the absence of one. `notFound()` throws, so nothing below runs.
  if (!post) notFound();

  return (
    <article class="post">
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
      <header class="post-head">
        <p class="meta">
          <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
          <span class="sep">·</span>
          <span>{readingMinutes(post)} min read</span>
          <a class="md-link" href={`/posts/${post.id}.md`}>
            .md
          </a>
        </p>
        <h1>{post.data.title}</h1>
        <p class="lede">{post.data.description}</p>
      </header>
      <div class="post-body" dangerHTML={markdownToHtml(post.body)} />
      <footer class="post-foot">
        <a href="/">← All posts</a>
        <span>
          Read this page as <a href={`/posts/${post.id}.md`}>markdown</a>
        </span>
      </footer>
    </article>
  );
}
