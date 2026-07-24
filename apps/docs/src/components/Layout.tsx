import { SECTIONS, docIndex, type SectionDef, type SectionGroup } from '../server/docs.api';
import { SearchModal } from './SearchModal';
import { ThemeToggle } from './ThemeToggle';

/**
 * Restores a persisted theme before first paint — must be the first body node.
 * The attribute lives on BODY (not <html>) on purpose: diff-dom-streaming
 * preserves body attributes during SPA diffing, so the theme survives navigation.
 */
const THEME_INIT =
  "const t=localStorage.getItem('janux-theme');if(t==='light'||t==='dark')document.body.dataset.theme=t;";

/** The engraved mark, inlined so CSS light-dark() flips tile/engraving with the theme. */
export function JanuxMark({ size = 26 }: { size?: number }) {
  return (
    <svg class="mark" viewBox="0 0 240 240" width={String(size)} height={String(size)} aria-hidden="true">
      <rect x="16" y="16" width="208" height="208" rx="48" class="mark-tile" />
      <rect x="112" y="58" width="16" height="124" rx="8" class="mark-fill" />
      <path d="M112 70 C 74 76, 58 100, 58 120 C 58 140, 74 164, 112 170" class="mark-stroke" />
      <circle cx="84" cy="112" r="9" class="mark-fill" />
      <path d="M128 70 L 168 84 L 182 120 L 168 156 L 128 170" class="mark-stroke" />
      <rect x="148" y="104" width="17" height="17" rx="3" class="mark-fill" />
    </svg>
  );
}

function GroupNav({ section, group, current }: { section: string; group: SectionGroup; current?: string }) {
  const docs = docIndex().filter((doc) => doc.section === section && group.slugs.includes(doc.slug));

  if (docs.length === 0) return null;

  return (
    <div class="nav-group">
      {group.label ? <p class="nav-group-label">{group.label}</p> : null}
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

function SectionNav({ def, current }: { def: SectionDef; current?: string }) {
  return (
    <details class="nav-section" open>
      <summary class="nav-label">{def.label}</summary>
      {def.groups.map((group, index) => (
        <GroupNav key={String(index)} section={def.section} group={group} current={current} />
      ))}
    </details>
  );
}

function SidebarNav({ current }: { current?: string }) {
  return (
    <div class="sidebar-nav">
      <a href="/playground" data-native class={current === '/playground' ? 'tool-link active' : 'tool-link'}>
        ⚡ Playground
      </a>
      {SECTIONS.map((def) => (
        <SectionNav key={def.section} def={def} current={current} />
      ))}
    </div>
  );
}

export function Layout({ children, current, sidebar = true }: { children: unknown; current?: string; sidebar?: boolean }) {
  return (
    <div class="shell">
      <script dangerHTML={THEME_INIT}></script>
      <header class="topbar">
        <a href="/" class="logo">
          <JanuxMark />
          Janux
        </a>
        <SearchModal persist eager />
        <nav class="top-links">
          <a href="/docs/guide/getting-started">Docs</a>
          <a href="/playground" data-native>Playground</a>
          <a href="/docs/more/examples">Examples</a>
          <a href="https://github.com/aralroca/Janux" target="_blank" rel="noopener">GitHub</a>
          <a href="https://www.npmjs.com/package/janux" target="_blank" rel="noopener">npm</a>
        </nav>
        <ThemeToggle />
      </header>
      <div class={sidebar ? 'layout' : 'layout no-sidebar'}>
        {sidebar ? (
          <nav class="sidebar">
            <details class="mobile-nav">
              <summary>Menu</summary>
              <SidebarNav current={current} />
            </details>
            <div class="desktop-nav">
              <SidebarNav current={current} />
            </div>
          </nav>
        ) : null}
        <div class="content">{children}</div>
      </div>
    </div>
  );
}
