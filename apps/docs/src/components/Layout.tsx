import { docIndex, SECTIONS } from '../server/docs.api';

const SECTION_LABELS: Record<string, string> = {
  guide: 'Guide',
  tutorial: 'Tutorial',
  reference: 'Reference',
  recipes: 'Recipes',
  more: 'More',
};

function SectionNav({ section, current }: { section: string; current?: string }) {
  const docs = docIndex().filter((doc) => doc.section === section);

  if (docs.length === 0) return null;

  return (
    <div class="nav-section">
      <p class="nav-label">{SECTION_LABELS[section] ?? section}</p>
      <ul>
        {docs.map((doc) => (
          <li key={doc.slug}>
            <a href={doc.path} class={doc.path === current ? 'active' : undefined}>
              {doc.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarNav({ current }: { current?: string }) {
  return (
    <div class="sidebar-nav">
      <a href="/playground" data-native class={current === '/playground' ? 'tool-link active' : 'tool-link'}>
        ⚡ Playground
      </a>
      {Object.keys(SECTIONS).map((section) => (
        <SectionNav key={section} section={section} current={current} />
      ))}
    </div>
  );
}

export function Layout({ children, current }: { children: unknown; current?: string }) {
  return (
    <div class="layout">
      <nav class="sidebar">
        <a href="/" class="logo">
          <img src="/logo.svg" alt="" width="30" height="30" />
          Janux
        </a>
        <details class="mobile-nav">
          <summary>Menu</summary>
          <SidebarNav current={current} />
        </details>
        <div class="desktop-nav">
          <SidebarNav current={current} />
        </div>
      </nav>
      <div class="content">{children}</div>
    </div>
  );
}
