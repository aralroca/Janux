import { ARTICLES } from '../../data/kb';

interface WikiShellProps {
  children: unknown;
  params?: { slug?: string };
}

/** The wiki's sub-shell: an article sidebar wrapping /wiki and every /wiki/:slug. */
export default function WikiLayout({ children, params }: WikiShellProps) {
  return (
    <section class="wiki" data-shell="wiki">
      <aside class="wiki-nav" aria-label="Articles">
        <p class="side-title">Articles</p>
        {Object.entries(ARTICLES).map(([slug, article]) => (
          <a key={slug} class="side-link" href={`/wiki/${slug}`} aria-current={params?.slug === slug ? 'page' : undefined}>
            {article.title}
          </a>
        ))}
        <p class="side-note">
          Sidebar from <code>wiki/_layout.tsx</code>
        </p>
      </aside>
      <div class="wiki-content">{children}</div>
    </section>
  );
}
