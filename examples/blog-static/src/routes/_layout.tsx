/** The blog shell: plain anchors everywhere — with no client runtime, every navigation is a real document load. */
export default function BlogLayout({ children }: { children: unknown }) {
  return (
    <div class="blog">
      <header class="masthead">
        <a class="brand" href="/">
          Janux Static Blog
        </a>
        <nav>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer class="agent-face">
        <span>For agents:</span> <a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">sitemap.xml</a>
      </footer>
    </div>
  );
}
