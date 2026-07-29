/**
 * The other end: a page that threw while rendering. `_500.tsx` answers with a
 * 500 and renders on its own — no `_layout.tsx` around it, because the layout
 * is code too and code is what just failed.
 */
export const meta = { title: 'Something broke — Janux KB' };

export default function ServerError() {
  return (
    <article class="card article gone standalone">
      <p class="eyebrow">The page threw</p>
      <h1>Something broke</h1>
      <p class="lead">
        <code>boom.tsx</code> throws on purpose. Janux logged the error server-side and answered with this page — note
        that the KB shell is gone: <code>_500.tsx</code> renders alone.
      </p>
      <p class="param">
        file: <code>_500.tsx</code>
      </p>
      <p class="crumbs">
        <a class="crumb" href="/">
          ← Home
        </a>
      </p>
    </article>
  );
}
