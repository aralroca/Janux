import { NavCounter } from '../components/NavCounter';

const LINKS: [string, string][] = [
  ['/', 'Home'],
  ['/wiki', 'Wiki'],
  ['/docs/guides/install', 'Docs'],
  ['/search', 'Search'],
  ['/tickets', 'Tickets'],
  ['/pricing', 'Pricing'],
];

const STYLES = `
  body { margin: 0; font-family: system-ui, sans-serif; color: #1c2733; }
  .kb-shell > header { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid #d9e1e8; }
  .kb-shell > header nav { display: flex; gap: 0.75rem; flex: 1; }
  .kb-shell > main { padding: 1.5rem; }
  .brand { font-weight: 700; text-decoration: none; color: inherit; }
  .nav-counter { border: 1px solid #d9e1e8; border-radius: 999px; padding: 0.25rem 0.75rem; background: #fff; cursor: pointer; }
  .wiki { display: flex; gap: 2rem; }
  .wiki aside { display: flex; flex-direction: column; gap: 0.5rem; min-width: 12rem; }
`;

/** The root shell: identical on every page, so SPA navigations never repaint it. */
export default function RootLayout({ children }: { children: unknown }) {
  return (
    <div class="kb-shell" data-shell="root">
      <style>{STYLES}</style>
      <header>
        <a class="brand" href="/">
          Janux KB
        </a>
        <nav aria-label="Sections">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <NavCounter persist />
      </header>
      <main>{children}</main>
    </div>
  );
}
