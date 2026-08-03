import type { PageMeta } from 'janux';
import { SiteSearch } from '../components/SiteSearch';
import { formatDate, publishedPosts, type Post } from '../content';

// No `canonical` until you own a domain: a relative one cannot be resolved, so
// the framework drops it and says so. Set `siteUrl` in janux.config.ts and add
// `canonical` here and in posts/[slug].tsx — that also turns on the sitemap.
export const meta: PageMeta = {
  title: '__APP_NAME__',
  description: 'A markdown content site with two faces: pages for people, projections and tools for agents.',
};

function PostCard({ post }: { post: Post }) {
  return (
    <article class="note-card">
      <p class="meta">
        <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
        <a class="md-link" href={`/posts/${post.id}.md`}>
          .md
        </a>
      </p>
      <h2>
        <a href={`/posts/${post.id}`}>{post.data.title}</a>
      </h2>
      <p class="summary">{post.data.summary}</p>
    </article>
  );
}

/** The machine-readable half of the same pages — half the point of this template. */
function AgentFace() {
  return (
    <footer class="agent-face">
      <p class="agent-title">Also readable by machines</p>
      <ul class="agent-links">
        <li>
          <a href="/llms.txt">/llms.txt</a>
          <span>Index of every page and tool, expanded from the posts</span>
        </li>
        <li>
          <a href="/posts/launching-this-site.md">/posts/&lt;slug&gt;.md</a>
          <span>Any page back as clean markdown</span>
        </li>
        <li>
          <a href="/_janux/manifest">/_janux/manifest</a>
          <span>The typed tools: search and subscribe</span>
        </li>
      </ul>
    </footer>
  );
}

export default function HomePage() {
  return (
    <>
      <header class="page-head">
        <h1>Latest posts</h1>
        <p class="lede">
          Markdown files in <code>content/posts/</code>, a typed frontmatter contract, and the same content served to
          agents as markdown and search results.
        </p>
      </header>
      <SiteSearch />
      <section class="note-list">
        {publishedPosts().map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </section>
      <AgentFace />
    </>
  );
}
