export const meta = ({ params }: { params: { filters: string } }) => ({
  title: params.filters ? `Search: ${params.filters} — Janux KB` : 'Search — Janux KB',
});

/** Optional catch-all: /search alone works, and so does /search/a/b. */
export default function SearchPage({ params }: { params: { filters: string } }) {
  const filters = params.filters ? params.filters.split('/') : [];

  return (
    <section class="search">
      <h1>Search</h1>
      <p class="filter-count">
        {filters.length === 0 ? 'No filters — the rest segment is optional.' : `${filters.length} filter(s) active.`}
      </p>
      {filters.length > 0 && (
        <ul>
          {filters.map((filter) => (
            <li key={filter}>
              <code>{filter}</code>
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/search/kind/article">Try /search/kind/article</a>
      </p>
    </section>
  );
}
