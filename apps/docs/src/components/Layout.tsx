import { docSlugs, docContent } from '../server/docs.api';

function titleOf(slug: string): string {
  return docContent(slug)?.match(/^# (.+)$/m)?.[1] ?? slug;
}

export function Layout({ children, current }: { children: unknown; current?: string }) {
  return (
    <div class="layout">
      <nav class="sidebar">
        <a href="/" class="logo">
          Janux
        </a>
        <ul>
          {docSlugs().map((slug) => (
            <li key={slug}>
              <a href={`/docs/${slug}`} class={slug === current ? 'active' : undefined}>
                {titleOf(slug)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div class="content">{children}</div>
    </div>
  );
}
