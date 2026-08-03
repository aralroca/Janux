/**
 * Every unmatched URL, and the one `posts/[slug].tsx` asks for when a slug names
 * a draft or nothing at all.
 */
export const meta = {
  title: 'Not found — __APP_NAME__',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <article class="note">
      <header class="note-head">
        <h1>Not found</h1>
        <p class="summary">There is no published page at this address.</p>
      </header>
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
    </article>
  );
}
