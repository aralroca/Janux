export const meta = { title: 'Janux KB — advanced routing' };

const DEMOS: [string, string, string][] = [
  ['/wiki/getting-started', 'wiki/[slug].tsx', 'one dynamic segment'],
  ['/docs/guides/deploy/vercel', 'docs/[...path].tsx', 'catch-all: one or more segments'],
  ['/search/kind/article', 'search/[[...filters]].tsx', 'optional catch-all: zero or more'],
  ['/tickets/123', 'tickets/[id=integer].tsx', 'typed matcher: digits only'],
  ['/pricing', '(marketing)/pricing.tsx', 'route group: invisible in the URL'],
];

/** The home page: a map of every route pattern this example exercises. */
export default function HomePage() {
  return (
    <section class="home">
      <h1>Janux KB</h1>
      <p>A tiny knowledge base whose only point is its URL space — every pattern the file-system router supports, one section each.</p>
      <ul>
        {DEMOS.map(([href, file, what]) => (
          <li key={href}>
            <a href={href}>{href}</a> — <code>{file}</code>, {what}
          </li>
        ))}
      </ul>
    </section>
  );
}
