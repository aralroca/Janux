/** The site shell. Posts render with no runtime at all, so links are plain anchors. */
export default function SiteLayout({ children }: { children: unknown }) {
  return (
    <div class="site">
      <header class="masthead">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true" />
          __APP_NAME__
        </a>
        <nav>
          <a href="/llms.txt">llms.txt</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer class="site-foot">
        <p>
          Markdown in <code>content/posts/</code>, frontmatter validated by <code>schema()</code>, every page also served
          as <code>.md</code>.
        </p>
      </footer>
    </div>
  );
}
