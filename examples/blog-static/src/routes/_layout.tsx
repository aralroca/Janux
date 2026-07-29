/** The blog shell: plain anchors everywhere — with no client runtime, every navigation is a real document load. */
export default function BlogLayout({ children }: { children: unknown }) {
  return (
    <div class="blog">
      <header class="masthead">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true" />
          Janux Static Blog
        </a>
        <nav>
          <span class="badge">0 KB JS</span>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
        </nav>
      </header>
      <main>{children}</main>
      <AgentFace />
    </div>
  );
}

/** The machine-readable half of the same pages — the point of the example. */
function AgentFace() {
  return (
    <footer class="agent-face">
      <p class="agent-title">Also readable by machines</p>
      <ul class="agent-links">
        <li>
          <a href="/llms.txt">/llms.txt</a>
          <span>Index of every page, expanded from the posts</span>
        </li>
        <li>
          <a href="/sitemap.xml">/sitemap.xml</a>
          <span>Absolute URLs for crawlers</span>
        </li>
        <li>
          <a href="/.md">/.md</a>
          <span>Any page back as clean markdown</span>
        </li>
      </ul>
      <p class="agent-note">
        Prerendered by Janux with <code>output: 'static'</code> — one HTML file per page, no server, no scripts.
      </p>
    </footer>
  );
}
