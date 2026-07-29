import { Layout } from '../components/Layout';

/**
 * Every URL this site does not have — including `/docs/<section>/<slug>` pairs
 * that name no doc, which the doc page reports with `notFound()`.
 */
export const meta = {
  title: 'Page not found — Janux',
  robots: 'noindex',
};

const SUGGESTIONS = [
  ['/docs/getting-started/what-is-janux', 'What is Janux'],
  ['/docs/getting-started/quick-start', 'Quick start'],
  ['/docs/guide/navigation', 'Routing & navigation'],
  ['/docs/more/examples', 'Examples'],
];

export default function NotFoundPage() {
  return (
    <Layout sidebar={false}>
      <div class="not-found">
        <p class="not-found-code">404</p>
        <h1>This page does not exist</h1>
        <p class="not-found-hint">The link may point at a page that was renamed, or the address may have a typo.</p>
        <ul class="not-found-links">
          {SUGGESTIONS.map(([href, label]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
