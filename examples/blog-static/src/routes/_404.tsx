/**
 * The page every unmatched URL gets — and the one `notFound()` asks for from
 * `posts/[slug].tsx`. `output: 'static'` writes it to `404.html`, which is the
 * file a static host serves when it has nothing at the path.
 */
export const meta = {
  title: 'Not found — Janux Static Blog',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <article class="post">
      <header class="post-head">
        <h1>Not found</h1>
        <p class="lede">There is no page at this address.</p>
      </header>
      <p class="crumb">
        <a href="/">← All posts</a>
      </p>
    </article>
  );
}
