import type { PageMeta } from 'janux';
import { posts, type Post } from '../content';

export const meta: PageMeta = {
  title: 'Janux Static Blog',
  description: 'A markdown blog prerendered to plain HTML — zero JavaScript, agent-readable.',
  canonical: '/',
};

function PostCard({ post }: { post: Post }) {
  return (
    <article class="post-card">
      <h2>
        <a href={`/posts/${post.slug}`}>{post.title}</a>
      </h2>
      <p class="byline">
        <time dateTime={post.date}>{post.date}</time> · <a href={`/posts/${post.slug}.md`}>view as markdown</a>
      </p>
      <p>{post.description}</p>
    </article>
  );
}

export default function HomePage() {
  return (
    <>
      <h1>Latest posts</h1>
      <section class="post-list">
        {posts().map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </section>
    </>
  );
}
