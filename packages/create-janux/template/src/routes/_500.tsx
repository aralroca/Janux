/**
 * Rendered when a page throws while the server is building it, under a 500
 * status. Unlike `_404`, it renders on its own — no `_layout` — because the
 * layout is code too, and code is what just failed.
 *
 * `error` is the thrown value. Janux already logged it; this is where you would
 * report it (Sentry, your audit log). Don't print it: it is for you, not for
 * the visitor.
 */
export default function ServerError({ error }: { error: unknown }) {
  return (
    <main class="status-page">
      <p class="status-code">500</p>
      <h1>Something went wrong</h1>
      <p class="status-hint">The page failed to render. It has been logged — try again in a moment.</p>
      <a class="status-back" href="/">
        ← Back home
      </a>
    </main>
  );
}
