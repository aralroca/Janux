export const meta = ({ params }: { params: { filters: string } }) => ({
  title: params.filters ? `Search: ${params.filters} — Janux KB` : 'Search — Janux KB',
});

/** Every preset is the same route: only the number of rest segments changes. */
const PRESETS: [string, string][] = [
  ['/search', 'no filters'],
  ['/search/kind/article', 'two segments'],
  ['/search/kind/article/lang/en', 'four segments'],
];

/** Optional catch-all: /search alone works, and so does /search/a/b. */
export default function SearchPage({ params }: { params: { filters: string } }) {
  const filters = params.filters ? params.filters.split('/') : [];

  return (
    <section class="card search">
      <p class="eyebrow">Optional catch-all</p>
      <h1>Search</h1>
      <p class="filter-count">
        {filters.length === 0 ? 'No filters — the rest segment is optional.' : `${filters.length} filter(s) active.`}
      </p>
      {filters.length > 0 && (
        <ul class="chips">
          {filters.map((filter) => (
            <li class="chip" key={filter}>
              <code>{filter}</code>
            </li>
          ))}
        </ul>
      )}
      <nav class="presets" aria-label="Filter presets">
        {PRESETS.map(([href, label]) => (
          <a key={href} class="preset" href={href} aria-current={href === currentUrl(filters) ? 'page' : undefined}>
            <code>{href}</code>
            <small>{label}</small>
          </a>
        ))}
      </nav>
    </section>
  );
}

/** The URL the current params came from — the preset row highlights it. */
function currentUrl(filters: string[]): string {
  return filters.length === 0 ? '/search' : `/search/${filters.join('/')}`;
}
