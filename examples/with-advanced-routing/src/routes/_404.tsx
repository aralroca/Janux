/**
 * The end of the URL space: when no pattern matches, the app answers with this
 * page under a 404 — no route file, no catch-all, just `_404.tsx` at the root
 * of `src/routes`. It renders inside the root `_layout.tsx`, so the shell is
 * still there.
 */
export const meta = {
  title: 'No such page — Janux KB',
  robots: 'noindex',
};

export default function NotFound({ ctx }: { ctx?: { pathname?: string } }) {
  return (
    <article class="card article gone">
      <p class="eyebrow">No route matched</p>
      <h1>Nothing here</h1>
      <p class="lead">
        Nothing in <code>src/routes</code> claims <code>{ctx?.pathname ?? 'this URL'}</code>, so the request ends here —
        with a 404 status, not a 200 that merely says so.
      </p>
      <p class="param">
        file: <code>_404.tsx</code>
      </p>
    </article>
  );
}
