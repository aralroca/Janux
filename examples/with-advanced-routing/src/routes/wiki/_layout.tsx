import { ARTICLES } from '../../data/kb';

/** The wiki's sub-shell: an article sidebar wrapping /wiki and every /wiki/:slug. */
export default function WikiLayout({ children }: { children: unknown }) {
  return (
    <section class="wiki" data-shell="wiki">
      <aside aria-label="Articles">
        {Object.entries(ARTICLES).map(([slug, article]) => (
          <a key={slug} href={`/wiki/${slug}`}>
            {article.title}
          </a>
        ))}
      </aside>
      <div class="wiki-content">{children}</div>
    </section>
  );
}
