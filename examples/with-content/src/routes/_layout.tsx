/** The site shell. Notes with no components in them render with no runtime at all, so links are plain anchors. */
export default function ContentLayout({ children }: { children: unknown }) {
  return (
    <div class="site">
      <header class="masthead">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true" />
          Field notes
        </a>
        <nav>
          <a href="/llms.txt">llms.txt</a>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer class="site-foot">
        <p>
          Markdown and MDX in <code>content/notes/</code>, frontmatter validated by <code>schema()</code>, prerendered with{' '}
          <code>output: 'static'</code>.
        </p>
      </footer>
    </div>
  );
}
