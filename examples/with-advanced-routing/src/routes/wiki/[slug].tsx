import { ARTICLES } from '../../data/kb';

export const meta = ({ params }: { params: { slug: string } }) => ({
  title: `${ARTICLES[params.slug]?.title ?? params.slug} — Janux KB`,
});

/** One dynamic segment: /wiki/anything lands here with `params.slug`. */
export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = ARTICLES[params.slug];

  if (!article) {
    return (
      <article class="card article empty">
        <p class="eyebrow">Matched, but empty</p>
        <h1>Not written yet</h1>
        <p class="lead">
          Nothing filed under <code>{params.slug}</code> — but the route matched: any single segment does.
        </p>
      </article>
    );
  }

  return (
    <article class="card article">
      <p class="eyebrow">Article</p>
      <h1>{article.title}</h1>
      <p class="lead">{article.body}</p>
      <p class="param">
        slug: <code>{params.slug}</code>
      </p>
    </article>
  );
}
