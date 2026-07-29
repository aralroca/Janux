export const meta = ({ params }: { params: { path: string } }) => ({
  title: `Docs: ${params.path} — Janux KB`,
});

/** Catch-all: /docs/a, /docs/a/b/c… — `params.path` is the joined tail. */
export default function DocsPage({ params }: { params: { path: string } }) {
  const segments = params.path.split('/');
  const crumbs = segments.map((segment, index) => ({
    segment,
    href: `/docs/${segments.slice(0, index + 1).join('/')}`,
  }));

  return (
    <article class="doc">
      <nav aria-label="Breadcrumbs">
        {crumbs.map(({ segment, href }) => (
          <a key={href} class="crumb" href={href}>
            {segment}
          </a>
        ))}
      </nav>
      <h1>Docs / {segments.join(' / ')}</h1>
      <p>
        <code>docs/[...path].tsx</code> matched <span class="segment-count">{segments.length}</span> segment(s) — every
        breadcrumb above is itself a valid catch-all URL.
      </p>
    </article>
  );
}
