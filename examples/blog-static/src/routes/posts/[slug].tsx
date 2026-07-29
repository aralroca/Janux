import type { PageMeta } from 'janux';
import { postBySlug, posts } from '../../content';
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
    <article>
      <h1>Post not found</h1>
      <p>
        No post named “{slug}”. <a href="/">Back to the index</a>.
      </p>
    </article>
  );
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);

  if (!post) return <NotFound slug={params.slug} />;

  return (
    <article class="post">
      <h1>{post.title}</h1>
      <p class="byline">
        <time dateTime={post.date}>{post.date}</time> · <a href={`/posts/${post.slug}.md`}>view as markdown</a>
      </p>
      <div class="post-body" dangerHTML={markdownToHtml(post.body)} />
      <p>
        <a href="/">← All posts</a>
      </p>
    </article>
  );
}
