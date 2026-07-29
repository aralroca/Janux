export const meta = { title: 'Wiki — Janux KB' };

/** /wiki itself: the static index the dynamic sibling never shadows. */
export default function WikiHome() {
  return (
    <article class="card wiki-home">
      <p class="eyebrow">Static route</p>
      <h1>Wiki</h1>
      <p class="lead">
        Pick an article on the left — each one is a single dynamic segment matched by <code>wiki/[slug].tsx</code>.
      </p>
      <p class="note">
        This index is <code>wiki/index.tsx</code>: a static path always wins over the dynamic sibling that would also
        match it.
      </p>
    </article>
  );
}
