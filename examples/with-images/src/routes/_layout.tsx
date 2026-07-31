/** No client entry, so this shell ships as plain HTML: every link is a real document load. */
export default function ImagesLayout({ children }: { children: unknown }) {
  return (
    <div class="page">
      <header class="masthead">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true" />
          Janux Images
        </a>
        <nav>
          <span class="badge">0 KB JS</span>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer class="colophon">
        <p>
          Prerendered with <code>output: 'static'</code>. Every candidate in a <code>srcset</code> on this page is a
          file in <code>dist/client/_janux/image/</code>, and the text you are reading is a self-hosted{' '}
          <code>woff2</code> in <code>dist/client/_janux/font/</code> — both written at build time, with nothing
          behind them at runtime.
        </p>
      </footer>
    </div>
  );
}
