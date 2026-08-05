export const meta = { title: 'Janux KB — advanced routing' };

/** `[url, file pattern, what the pattern is called, what it proves]`. */
const DEMOS: [string, string, string, string][] = [
  ['/wiki/getting-started', 'wiki/[slug].tsx', 'dynamic', 'One segment, handed to the page as params.slug.'],
  ['/docs/guides/deploy/vercel', 'docs/[...path].tsx', 'catch-all', 'One or more segments, joined in params.path.'],
  ['/search/kind/article', 'search/[[...filters]].tsx', 'optional catch-all', 'Zero or more — bare /search matches too.'],
  ['/tickets/123', 'tickets/[id=integer].tsx', 'typed matcher', 'Digits only; /tickets/abc matches no route at all.'],
  ['/wiki', 'wiki/_layout.tsx', 'nested layout', 'A sub-shell wrapping /wiki and every article under it.'],
  ['/pricing', '(marketing)/pricing.tsx', 'route group', 'The (marketing) directory never shows up in the URL.'],
  ['/nothing/here', '_404.tsx', 'not found', 'No pattern matches, so the app answers with its own page and a 404.'],
  ['/boom', '_500.tsx', 'server error', 'A page that throws answers with its own page and a 500, layout aside.'],
];

/** `[url, what janux.config.ts says about it, what the browser ends up showing]`. */
const LEGACY: [string, string, string][] = [
  ['/kb/getting-started', 'redirect 308', 'Lands on /wiki/getting-started — the address bar changes.'],
  ['/legacy-docs/guides/deploy', 'redirect 308', 'The whole tail travels: /docs/guides/deploy.'],
  ['/plans', 'redirect 301', 'The page is gone, so the old URL points at /pricing.'],
  ['/handbook/guides/deploy', 'rewrite', 'Served by docs/[...path].tsx, and the URL stays /handbook/…'],
];

/** The home page: a map of every route pattern this example exercises. */
export default function HomePage() {
  return (
    <section class="home">
      <header class="page-head">
        <p class="eyebrow">File-system router</p>
        <h1>Janux KB</h1>
        <p class="lead">
          A tiny knowledge base whose only point is its URL space — every pattern the router supports, one section each,
          all of it navigated as a SPA.
        </p>
      </header>
      <ul class="patterns">
        {DEMOS.map(([href, file, kind, what]) => (
          <li class="pattern" key={href}>
            <a class="pattern-url" href={href}>
              {href}
            </a>
            <span class="pattern-kind">{kind}</span>
            <code class="pattern-file">{file}</code>
            <p class="pattern-note">{what}</p>
          </li>
        ))}
      </ul>
      <h2 class="legacy-head">URLs with no file behind them</h2>
      <p class="legacy-lead">
        Declared in <code>janux.config.ts</code>, in the same segment grammar as the route files, and applied before
        anything resolves a route. A redirect answers with a status and a <code>Location</code>; a rewrite serves
        another route and leaves the address bar alone.
      </p>
      <ul class="patterns">
        {LEGACY.map(([href, kind, what]) => (
          <li class="pattern" key={href}>
            <a class="pattern-url" href={href} data-native>
              {href}
            </a>
            <span class="pattern-kind">{kind}</span>
            <p class="pattern-note">{what}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
