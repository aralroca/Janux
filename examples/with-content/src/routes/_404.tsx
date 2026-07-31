/**
 * Every unmatched URL, and the one `notes/[slug].tsx` asks for when a slug names
 * a draft or nothing at all. `output: 'static'` writes it to `404.html`, the
 * file a static host serves when it has nothing at the path.
 */
export const meta = {
  title: 'Not found — Janux content collections',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <article class="note">
      <header class="note-head">
        <h1>Not found</h1>
        <p class="summary">There is no published note at this address.</p>
      </header>
      <p class="crumb">
        <a href="/">← All notes</a>
      </p>
    </article>
  );
}
