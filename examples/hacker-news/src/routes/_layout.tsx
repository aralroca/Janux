import { SearchBox } from '../components/SearchBox';

/** The orange bar: identical on every page, so SPA navigations never repaint it. */
export default function Shell({ children }: { children: unknown }) {
  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href="/">
          ⚡ Janux HN
        </a>
        <nav aria-label="Pages">
          <a href="/">top</a>
        </nav>
      </header>
      {children}
      <footer class="footer">
        <SearchBox />
        <p class="footnote">30 deterministic local stories — no network, no API keys.</p>
      </footer>
    </div>
  );
}
