export const meta = { title: 'Wiki — Janux KB' };

/** /wiki itself: the static index the dynamic sibling never shadows. */
export default function WikiHome() {
  return (
    <article class="wiki-home">
      <h1>Wiki</h1>
      <p>Pick an article on the left — each one is a single dynamic segment matched by <code>wiki/[slug].tsx</code>.</p>
    </article>
  );
}
