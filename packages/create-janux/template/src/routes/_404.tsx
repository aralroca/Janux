/**
 * Every URL the router does not match renders this page, under a 404 status.
 * A page that matched but has nothing to show asks for it too: import
 * `notFound` from 'janux' and call `notFound()` — no route file needed.
 *
 * It renders inside `_layout.tsx` (when the app has one): a missing page is
 * still a page of the site.
 */
export const meta = {
  title: 'Page not found',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <main class="status-page">
      <p class="status-code">404</p>
      <h1>This page does not exist</h1>
      <p class="status-hint">The link may be outdated, or the address may have a typo.</p>
      <a class="status-back" href="/">
        ← Back home
      </a>
    </main>
  );
}
