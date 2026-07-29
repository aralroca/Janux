/**
 * Unmatched URLs land here — and so does `/item/999`, where the route matched
 * but no story exists and the page called `notFound()`.
 */
export const meta = {
  title: 'Janux HN — no such page',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <main class="page item">
      <h1>No such page</h1>
      <p>
        <a href="/">← back to the front page</a>
      </p>
    </main>
  );
}
