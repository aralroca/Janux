import type { PageMeta } from 'janux';
import { formatDate, posts, readingMinutes, type Post } from '../content';

export const meta: PageMeta = {
  title: 'Janux Static Blog',
  description: 'A markdown blog prerendered to plain HTML — zero JavaScript, agent-readable.',
  canonical: '/',
};

function PostCard({ post }: { post: Post }) {
  return (
    <article class="post-card">
      <p class="meta">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span class="sep">·</span>
        <span>{readingMinutes(post)} min read</span>
      </p>
      <h2>
        <a href={`/posts/${post.slug}`}>{post.title}</a>
      </h2>
      <p class="excerpt">{post.description}</p>
      <p class="card-foot">
        <a class="read-link" href={`/posts/${post.slug}`}>
          Read post <span aria-hidden="true">→</span>
        </a>
        <a class="md-link" href={`/posts/${post.slug}.md`}>
          .md
        </a>
      </p>
    </article>
  );
}

export default function HomePage() {
  return (
    <>
      <header class="page-head">
        <h1>Latest posts</h1>
        <p class="lede">
          Markdown files in <code>content/</code>, prerendered to plain HTML at build time. No runtime, no hydration —
          and the same posts served to agents as markdown.
        </p>
      </header>
      <section class="post-list">
        {posts().map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </section>
    </>
  );
}
