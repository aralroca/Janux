/** The shell every page shares. Plain anchors: the pages are prerendered files. */
export default function BasecampLayout({ children }: { children: unknown }) {
  return (
    <div class="app">
      <header class="masthead">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true" />
          Basecamp
        </a>
        <nav>
          <a href="/signals">Signals</a>
          <a href="/offline">Offline</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer class="colophon">
        <p>
          Built by <code>janux build</code>, then kept by <code>/sw.js</code>. Turn off the network and reload — the
          pages you have opened are still here.
        </p>
      </footer>
    </div>
  );
}
